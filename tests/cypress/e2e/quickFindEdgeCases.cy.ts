import {
    createPageViaGraphql,
    createTestToken,
    MEDIUM_TIMEOUT,
    openSearchModal,
    searchInModal,
    SITE_KEY,
    updateQuickFindConfigurationViaGraphql,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind edge cases and shortcuts', () => {
    const token = createTestToken();
    const pageTitle = `quick-find edge title ${token}`;

    before('Seed content', () => {
        cy.login();
        createPageViaGraphql(SITE_KEY, `quick-find-edge-page-${token}`, pageTitle);
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

    it('closes the modal when pressing Escape', () => {
        openSearchModal();

        cy.get('body').type('{esc}');
        cy.get('[data-quick-find-panel="true"]').should('not.exist');
    });

    it('toggles modal visibility with Ctrl+K', () => {
        openSearchModal();

        cy.get('body').type('{ctrl}k');
        cy.get('[data-quick-find-panel="true"]').should('not.exist');

        cy.get('body').type('{ctrl}k');
        cy.get('[data-quick-find-panel="true"]', {timeout: MEDIUM_TIMEOUT}).should('be.visible');
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
