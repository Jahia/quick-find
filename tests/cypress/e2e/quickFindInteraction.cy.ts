import {
    createPageViaGraphql,
    createTestToken,
    MEDIUM_TIMEOUT,
    RESULT_ROW_SELECTOR,
    SEARCH_INPUT_SELECTOR,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind keyboard interaction', () => {
    const token = createTestToken();

    before('Seed page content', () => {
        cy.login();
        createPageViaGraphql(SITE_KEY, `quick-find-nav-alpha-${token}`, `quick-find nav alpha ${token}`);
        createPageViaGraphql(SITE_KEY, `quick-find-nav-beta-${token}`, `quick-find nav beta ${token}`);
    });

    beforeEach(() => {
        visitQuickFindSiteInJContent(SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('focuses the first result row when pressing Tab from the search input', () => {
        searchInModal(`quick-find nav ${token}`);

        cy.get(RESULT_ROW_SELECTOR, {timeout: MEDIUM_TIMEOUT}).first().should('be.visible');
        cy.get('@searchInput').focus();
        cy.realPress('Tab');

        cy.focused().should('match', RESULT_ROW_SELECTOR).should('have.attr', 'data-quick-find-result-index', '0');
    });

    it('moves focus to the next result row on consecutive Tab presses', () => {
        searchInModal(`quick-find nav ${token}`);

        cy.get(RESULT_ROW_SELECTOR, {timeout: MEDIUM_TIMEOUT}).its('length').should('be.gte', 2);
        cy.get('@searchInput').focus();
        cy.realPress('Tab');
        cy.focused().should('match', RESULT_ROW_SELECTOR).should('have.attr', 'data-quick-find-result-index', '0');

        cy.realPress('Tab');
        cy.focused().should('match', RESULT_ROW_SELECTOR).should('have.attr', 'data-quick-find-result-index', '1');
    });

    it('returns focus to the search input on Shift+Tab from the first result row', () => {
        searchInModal(`quick-find nav ${token}`);

        cy.get(RESULT_ROW_SELECTOR, {timeout: MEDIUM_TIMEOUT}).first().should('be.visible');
        cy.get('@searchInput').focus();
        cy.realPress('Tab');
        cy.focused().should('match', RESULT_ROW_SELECTOR).should('have.attr', 'data-quick-find-result-index', '0');

        cy.realPress(['Shift', 'Tab']);
        cy.focused().should('match', SEARCH_INPUT_SELECTOR);
    });
});
