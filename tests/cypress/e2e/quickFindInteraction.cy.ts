import {
    closeSearchModal,
    createPageViaGraphql,
    createTestToken,
    LONG_TIMEOUT,
    MEDIUM_TIMEOUT,
    openSearchModal,
    RESULT_ROW_SELECTOR,
    SEARCH_INPUT_SELECTOR,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

// The test browser cannot switch its keyboard layout, so a synthetic keydown on the document
// carries the key and the code that the layout would send. Opening and closing the modal first
// proves that QuickFindModal attached its listeners.
const pressCtrlOnKey = (key: string, code: string) => {
    cy.document().trigger('keydown', {key, code, ctrlKey: true});
};

const armShortcut = () => {
    openSearchModal();
    closeSearchModal();
};

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

    it('opens the modal with Ctrl+K on a layout without Latin letters', () => {
        armShortcut();

        // A Russian layout types "л" on the K key.
        pressCtrlOnKey('л', 'KeyK');

        cy.get(SEARCH_INPUT_SELECTOR, {timeout: LONG_TIMEOUT}).should('be.visible');
    });

    it('matches the K that a Latin layout types, and not the K position', () => {
        armShortcut();

        // Dvorak types "t" at the KeyK position and "k" at the KeyV position. Ctrl+K toggles the
        // modal, so the modal is open only when the first press did nothing.
        pressCtrlOnKey('t', 'KeyK');
        pressCtrlOnKey('k', 'KeyV');

        cy.get(SEARCH_INPUT_SELECTOR, {timeout: LONG_TIMEOUT}).should('be.visible');
    });
});
