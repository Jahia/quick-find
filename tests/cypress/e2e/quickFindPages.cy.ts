import {deleteSite} from '@jahia/cypress';
import {
    createPageViaGraphql,
    createTestToken,
    ensureSiteExists,
    LONG_TIMEOUT,
    MEDIUM_TIMEOUT,
    RESULT_ROW_SELECTOR,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

const PAGES_ROW_SELECTOR = `[data-quick-find-results-section-key="quick-find-jcr-pages"] ${RESULT_ROW_SELECTOR}`;
// English and French, edited in French, while the interface of the test user is English.
const BILINGUAL_SITE_KEY = 'quick-find-pages-en-fr';

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

describe('QuickFind pages provider in another language than the interface', () => {
    const token = createTestToken();
    const pageName = `quick-find-pages-fr-${token}`;
    const frenchTitle = `quick-find page française ${token}`;

    before('Create a bilingual site with a page titled in French', () => {
        cy.login();
        ensureSiteExists(BILINGUAL_SITE_KEY, {
            locale: 'fr',
            languages: 'en,fr',
            serverName: `${BILINGUAL_SITE_KEY}.localhost`
        });
        createPageViaGraphql(BILINGUAL_SITE_KEY, pageName, `quick-find english page ${token}`, {
            properties: [{name: 'jcr:title', language: 'fr', value: frenchTitle}]
        });
    });

    after('Delete the bilingual site', () => {
        deleteSite(BILINGUAL_SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('opens a page in the language jContent edits', () => {
        cy.visitJContentPage(BILINGUAL_SITE_KEY, 'fr');
        searchInModal(frenchTitle);
        cy.contains(PAGES_ROW_SELECTOR, frenchTitle, {timeout: LONG_TIMEOUT}).click();
        cy.get('[data-quick-find-panel="true"]').should('not.exist');

        cy.location('pathname', {timeout: LONG_TIMEOUT}).should(
            'include',
            `/jcontent/${BILINGUAL_SITE_KEY}/fr/pages/home/${pageName}`
        );
    });
});
