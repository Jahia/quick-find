import {
    createPageViaGraphql,
    createTestToken,
    MEDIUM_TIMEOUT,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind pages provider', () => {
    const token = createTestToken();
    const exactTitle = `quick-find pages exact ${token}`;
    const broaderTitle = `quick-find pages broader ${token}`;

    before('Seed page content via GraphQL', () => {
        cy.login();
        createPageViaGraphql(SITE_KEY, `quick-find-pages-exact-${token}`, exactTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-pages-broader-${token}`, broaderTitle);
    });

    beforeEach(() => {
        visitQuickFindSiteInJContent(SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('finds a page created via GraphQL', () => {
        searchInModal(exactTitle);

        cy.get('[data-quick-find-panel="true"]').contains('Pages', {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').contains(exactTitle, {timeout: MEDIUM_TIMEOUT});
    });

    it('filters page results by query term', () => {
        searchInModal(`exact ${token}`);

        cy.get('[data-quick-find-panel="true"]').contains(exactTitle, {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').should('not.contain', broaderTitle);
    });
});
