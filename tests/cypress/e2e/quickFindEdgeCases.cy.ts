import {
    createPageViaGraphql,
    createTestToken,
    MEDIUM_TIMEOUT,
    openSearchModal,
    RESULT_ROW_SELECTOR,
    searchInModal,
    SITE_KEY,
    updateQuickFindConfigurationViaGraphql,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind edge cases', () => {
    const token = createTestToken();
    const pageTitle = `quick-find edge title ${token}`;
    const longPathName = `quick-find-edge-long-path-${'segment-'.repeat(12)}${token}`;
    const longPathTitle = `quick-find long path ${token}`;

    before('Seed content', () => {
        cy.login();
        createPageViaGraphql(SITE_KEY, `quick-find-edge-page-${token}`, pageTitle);
        createPageViaGraphql(SITE_KEY, longPathName, longPathTitle);
    });

    beforeEach(function () {
        visitQuickFindSiteInJContent(SITE_KEY);

        const currentTestTitle = this.currentTest?.fullTitle() || 'unknown test';
        cy.log(`[quick-find-test] ${currentTestTitle}`);
        cy.window().then(win => {
            win.console.log('[quick-find-test]', currentTestTitle);
        });
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('shows global no-results state for an unknown query', () => {
        searchInModal('quick-find-edge-no-match-xyz');

        cy.get('[data-quick-find-panel="true"]').contains('No results', {timeout: MEDIUM_TIMEOUT});
    });

    it('keeps the modal responsive for special-character queries', () => {
        const specialQuery = '"/sites/test?x=1&y=2"';
        searchInModal(specialQuery);

        cy.get('[data-quick-find-panel="true"]', {timeout: MEDIUM_TIMEOUT}).should('be.visible');
        cy.get('@searchInput').should('have.value', specialQuery);
    });

    it('matches page results with case-insensitive query', () => {
        searchInModal(pageTitle.toUpperCase());

        cy.get('[data-quick-find-panel="true"]').contains('Pages', {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').contains(pageTitle, {timeout: MEDIUM_TIMEOUT});
    });

    it('keeps a long path on one line inside its result row', () => {
        searchInModal(longPathTitle);

        cy.contains(RESULT_ROW_SELECTOR, longPathTitle, {timeout: MEDIUM_TIMEOUT}).then($row => {
            const path = $row.find(`[title="/sites/${SITE_KEY}/home/${longPathName}"]`);
            expect(path, 'path that shows the full path on hover').to.have.length(1);

            const pathBox = path[0].getBoundingClientRect();
            expect(pathBox.height, 'path height').to.be.lessThan(20);
            expect(pathBox.bottom, 'path bottom').to.be.at.most($row[0].getBoundingClientRect().bottom);
        });
    });

    it('closes the modal when pressing Escape', () => {
        openSearchModal();

        cy.get('body').type('{esc}');
        cy.get('[data-quick-find-panel="true"]').should('not.exist');
    });

    it('does not trigger search below min chars and starts searching at min chars', () => {
        updateQuickFindConfigurationViaGraphql({
            minSearchChars: 3,
            jcrFindDelayInTypingToLaunchSearch: 80
        });

        cy.reload();
        openSearchModal();

        cy.get('@searchInput').clear();
        cy.get('@searchInput').type('ab');
        cy.get('[data-quick-find-empty-state="hint"]', {timeout: MEDIUM_TIMEOUT}).should('be.visible');

        cy.get('@searchInput').clear();
        cy.get('@searchInput').type('abc');
        cy.get('[data-quick-find-empty-state="no-results"]', {timeout: 4000}).should('be.visible');
    });
});
