import {
    createMediaViaGraphql,
    createTestToken,
    MEDIUM_TIMEOUT,
    RESULT_ROW_SELECTOR,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind media provider', () => {
    const token = createTestToken();
    const exactFile = `quick-find-media-exact-${token}.txt`;
    const broaderFile = `quick-find-media-broader-${token}.txt`;
    const webpFile = `quick-find-media-webp-${token}.webp`;

    before('Seed media content via GraphQL', () => {
        cy.login();
        createMediaViaGraphql(SITE_KEY, exactFile);
        createMediaViaGraphql(SITE_KEY, broaderFile);
        // Text bytes under an image MIME type: the image service makes no thumbnail for
        // it, as for a real webp file.
        createMediaViaGraphql(SITE_KEY, webpFile, 'image/webp');
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

    it('shows the file itself as the thumbnail of an image that has no generated thumbnail', () => {
        searchInModal(webpFile);

        cy.contains(RESULT_ROW_SELECTOR, webpFile, {timeout: MEDIUM_TIMEOUT})
            .find('img')
            .should('have.attr', 'src')
            .and('match', new RegExp(`/files/default/sites/${SITE_KEY}/files/${webpFile}$`));
    });

    it('shows no thumbnail for a file that is not an image', () => {
        searchInModal(exactFile);

        cy.contains(RESULT_ROW_SELECTOR, exactFile, {timeout: MEDIUM_TIMEOUT})
            .find('img')
            .should('not.exist');
    });
});
