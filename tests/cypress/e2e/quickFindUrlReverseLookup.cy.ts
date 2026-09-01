import {
    buildVanityLookupUrl,
    createPageViaGraphql,
    createTestToken,
    isJahiaVanityHostnameStrategy,
    MEDIUM_TIMEOUT,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind URL reverse lookup provider', () => {
    const token = createTestToken();
    const pageName = `quick-find-url-lookup-${token}`;
    const pageTitle = `quick-find url lookup ${token}`;
    const localePathPageName = 'buy';
    const homePathPageName = 'luxe-title';

    before('Seed URL lookup content', () => {
        return cy.login().then(() =>
            createPageViaGraphql(SITE_KEY, pageName, pageTitle)
                .then(() => createPageViaGraphql(SITE_KEY, localePathPageName, `quick-find locale path ${token}`))
                .then(() => createPageViaGraphql(SITE_KEY, homePathPageName, `quick-find home path ${token}`))
        );
    });

    beforeEach(() => {
        visitQuickFindSiteInJContent(SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('resolves a direct JCR path query to URL/path match results', () => {
        searchInModal(`/sites/${SITE_KEY}/home/${pageName}`);

        cy.get('[data-quick-find-results-section-key="quick-find-url-reverse-lookup"]', {
            timeout: MEDIUM_TIMEOUT
        }).should('be.visible');
        cy.get('[data-quick-find-panel="true"]').contains(pageTitle, {timeout: MEDIUM_TIMEOUT});
    });

    it('resolves a short URL-like path to the page under /home', () => {
        searchInModal(`/${pageName}`);

        cy.get('[data-quick-find-results-section-key="quick-find-url-reverse-lookup"]', {
            timeout: MEDIUM_TIMEOUT
        }).should('be.visible');
        cy.get('[data-quick-find-panel="true"]').contains(pageTitle, {timeout: MEDIUM_TIMEOUT});
    });

    it('resolves a full URL that includes a locale prefix in the path', () => {
        searchInModal('https://pmdemo-jahiapm.internal.cloud.jahia.com/fr/home/buy.html');

        cy.get('[data-quick-find-results-section-key="quick-find-url-reverse-lookup"]', {
            timeout: MEDIUM_TIMEOUT
        }).should('be.visible');
        cy.get('[data-quick-find-panel="true"]').contains(`/home/${localePathPageName}`, {timeout: MEDIUM_TIMEOUT});
    });

    it('resolves a full URL under /home without /sites/{siteKey}', () => {
        searchInModal('https://pmdemo-jahiapm.internal.cloud.jahia.com/home/luxe-title.html');

        cy.get('[data-quick-find-results-section-key="quick-find-url-reverse-lookup"]', {
            timeout: MEDIUM_TIMEOUT
        }).should('be.visible');
        cy.get('[data-quick-find-panel="true"]').contains(`/home/${homePathPageName}`, {timeout: MEDIUM_TIMEOUT});
    });

    (isJahiaVanityHostnameStrategy() ? it : it.skip)(
        'resolves a full vanity-style URL when running with jahia hostname strategy',
        () => {
            searchInModal(buildVanityLookupUrl(`/${pageName}`));

            cy.get('[data-quick-find-results-section-key="quick-find-url-reverse-lookup"]', {
                timeout: MEDIUM_TIMEOUT
            }).should('be.visible');
            cy.get('[data-quick-find-panel="true"]').contains(pageTitle, {timeout: MEDIUM_TIMEOUT});
        }
    );
});
