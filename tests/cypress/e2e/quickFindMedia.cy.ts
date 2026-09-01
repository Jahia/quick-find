import {
    createMediaViaGraphql,
    createTestToken,
    MEDIUM_TIMEOUT,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind media provider', () => {
    const token = createTestToken();
    const exactFile = `quick-find-media-exact-${token}.txt`;
    const broaderFile = `quick-find-media-broader-${token}.txt`;

    before('Seed media content via GraphQL', () => {
        cy.login();
        createMediaViaGraphql(SITE_KEY, exactFile);
        createMediaViaGraphql(SITE_KEY, broaderFile);
    });

    beforeEach(() => {
        visitQuickFindSiteInJContent(SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('finds a media node created via GraphQL', () => {
        searchInModal(exactFile);

        cy.get('[data-quick-find-panel="true"]').contains('Media', {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').contains(exactFile, {timeout: MEDIUM_TIMEOUT});
    });

    it('filters media results by query term', () => {
        searchInModal(`exact-${token}`);

        cy.get('[data-quick-find-panel="true"]').contains(exactFile, {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').should('not.contain', broaderFile);
    });
});
