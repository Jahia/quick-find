import {
    createMediaFolderViaGraphql,
    createMediaInFolderViaGraphql,
    createMediaViaGraphql,
    createTestToken,
    LONG_TIMEOUT,
    MEDIUM_TIMEOUT,
    removeThumbnailViaGraphql,
    RESULT_ROW_SELECTOR,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

const MEDIA_ROW_SELECTOR = `[data-quick-find-results-section-key="quick-find-jcr-media"] ${RESULT_ROW_SELECTOR}`;

// A file of the page jContent shows: a card of the grid, or a row of the list.
const jcontentMediaItem = (fileName: string) =>
    `[data-sel-role-card="${fileName}"], [data-cm-role="table-content-list-row"][data-node-name="${fileName}"]`;

// One file more than the 25 rows of a jContent page.
const PAGED_FILE_COUNT = 26;

describe('QuickFind media provider', () => {
    const token = createTestToken();
    const exactFile = `quick-find-media-exact-${token}.txt`;
    const broaderFile = `quick-find-media-broader-${token}.txt`;
    const webpFile = `quick-find-media-webp-${token}.webp`;
    const pagedFolder = `quick-find-media-paged-${token}`;
    const pagedFiles = Array.from(
        {length: PAGED_FILE_COUNT},
        (_, index) => `quick-find-media-paged-${token}-${String(index).padStart(2, '0')}.txt`
    );

    before('Seed media content via GraphQL', () => {
        cy.login();
        createMediaViaGraphql(SITE_KEY, exactFile);
        createMediaViaGraphql(SITE_KEY, broaderFile);
        // An image file without a thumbnail, as Jahia 8.2.3.2 leaves a real webp file.
        createMediaViaGraphql(SITE_KEY, webpFile, 'image/webp');
        removeThumbnailViaGraphql(SITE_KEY, webpFile);
        // The newest file comes first in jContent, so the first file is the last row: page 2.
        createMediaFolderViaGraphql(SITE_KEY, pagedFolder);
        pagedFiles.forEach(fileName => createMediaInFolderViaGraphql(SITE_KEY, pagedFolder, fileName));
    });

    const locateMedia = (fileName: string) => {
        searchInModal(fileName);
        cy.contains(MEDIA_ROW_SELECTOR, fileName, {timeout: LONG_TIMEOUT}).click();
        cy.get('[data-quick-find-panel="true"]').should('not.exist');
    };

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

        cy.contains(RESULT_ROW_SELECTOR, exactFile, {timeout: MEDIUM_TIMEOUT}).find('img').should('not.exist');
    });

    it('locates a file of the media root in the media root, and selects it', () => {
        locateMedia(exactFile);

        cy.location('pathname', {timeout: LONG_TIMEOUT}).should(
            'match',
            new RegExp(`/jcontent/${SITE_KEY}/[^/]+/media/files$`)
        );
        cy.get(jcontentMediaItem(exactFile), {timeout: LONG_TIMEOUT}).should('exist');
        cy.get('[data-sel-role="side-panel"]', {timeout: LONG_TIMEOUT}).should('be.visible');
    });

    it('locates a file on the page of its folder that lists it, and selects it', () => {
        locateMedia(pagedFiles[0]);

        cy.location('pathname', {timeout: LONG_TIMEOUT}).should('match', new RegExp(`/media/files/${pagedFolder}$`));
        cy.get(jcontentMediaItem(pagedFiles[0]), {timeout: LONG_TIMEOUT}).should('exist');
        cy.get('[data-sel-role="side-panel"]', {timeout: LONG_TIMEOUT}).should('be.visible');
    });
});
