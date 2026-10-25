import {deleteSite} from '@jahia/cypress';
import {
    ensureSiteExists,
    LONG_TIMEOUT,
    RESULT_ROW_SELECTOR,
    searchInModal,
    SITE_KEY,
    updateQuickFindConfigurationViaGraphql,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

const SITES_ROW_SELECTOR = `[data-quick-find-results-section-key="quick-find-sites"] ${RESULT_ROW_SELECTOR}`;
const SITE_SWITCHER_SELECTOR = '[data-cm-role="site-switcher"]';

// French only, so a switch from English lands on French, the default language of the site.
const FRENCH_SITE_KEY = 'quick-find-sites-fr';
// English and French with French by default, so a switch from English stays in English.
const BILINGUAL_SITE_KEY = 'quick-find-sites-en-fr';

describe('QuickFind sites provider', () => {
    const switchToSite = (query: string, siteKey: string) => {
        searchInModal(query);
        cy.contains(SITES_ROW_SELECTOR, siteKey, {timeout: LONG_TIMEOUT}).focus();
        cy.realPress('Enter');
        cy.get('[data-quick-find-panel="true"]').should('not.exist');
    };

    before('Create the sites to switch to', () => {
        ensureSiteExists(FRENCH_SITE_KEY, {
            locale: 'fr',
            languages: 'fr',
            serverName: `${FRENCH_SITE_KEY}.localhost`
        });
        ensureSiteExists(BILINGUAL_SITE_KEY, {
            locale: 'fr',
            languages: 'en,fr',
            serverName: `${BILINGUAL_SITE_KEY}.localhost`
        });
    });

    after('Delete the sites to switch to', () => {
        updateQuickFindConfigurationViaGraphql({sitesEnabled: true});
        deleteSite(FRENCH_SITE_KEY);
        deleteSite(BILINGUAL_SITE_KEY);
    });

    beforeEach(() => {
        visitQuickFindSiteInJContent(SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('lists the matching sites and shows the current site disabled', () => {
        searchInModal('quick find');

        cy.contains(SITES_ROW_SELECTOR, FRENCH_SITE_KEY, {timeout: LONG_TIMEOUT}).should(
            'not.have.attr',
            'aria-disabled'
        );
        cy.contains(SITES_ROW_SELECTOR, BILINGUAL_SITE_KEY).should('not.have.attr', 'aria-disabled');
        cy.contains(SITES_ROW_SELECTOR, SITE_KEY)
            .should('have.attr', 'aria-disabled', 'true')
            .and('contain', 'Current site');
    });

    it('does nothing on Enter on the current site', () => {
        searchInModal('quick find');
        cy.contains(SITES_ROW_SELECTOR, SITE_KEY, {timeout: LONG_TIMEOUT}).focus();
        cy.realPress('Enter');

        cy.get('[data-quick-find-panel="true"]').should('be.visible');
        cy.location('pathname').should('include', `/jcontent/${SITE_KEY}/en/pages`);
    });

    it('switches to the default language of a site that lacks the current language', () => {
        switchToSite(FRENCH_SITE_KEY, FRENCH_SITE_KEY);

        cy.location('pathname', {timeout: LONG_TIMEOUT}).should('include', `/jcontent/${FRENCH_SITE_KEY}/fr/pages`);
        cy.get(SITE_SWITCHER_SELECTOR, {timeout: LONG_TIMEOUT}).should('contain', FRENCH_SITE_KEY);
    });

    it('keeps the current language when the site has it, and marks the new site as current', () => {
        switchToSite(BILINGUAL_SITE_KEY, BILINGUAL_SITE_KEY);

        cy.location('pathname', {timeout: LONG_TIMEOUT}).should('include', `/jcontent/${BILINGUAL_SITE_KEY}/en/pages`);
        cy.get(SITE_SWITCHER_SELECTOR, {timeout: LONG_TIMEOUT}).should('contain', BILINGUAL_SITE_KEY);

        searchInModal('quick find');
        cy.contains(SITES_ROW_SELECTOR, BILINGUAL_SITE_KEY, {timeout: LONG_TIMEOUT}).should(
            'have.attr',
            'aria-disabled',
            'true'
        );
        cy.contains(SITES_ROW_SELECTOR, SITE_KEY).should('not.have.attr', 'aria-disabled');
    });

    it('keeps the jContent mode, as the jContent site switcher does', () => {
        cy.visitJContentPage(SITE_KEY, 'en', 'media');
        switchToSite(BILINGUAL_SITE_KEY, BILINGUAL_SITE_KEY);

        cy.location('pathname', {timeout: LONG_TIMEOUT}).should('include', `/jcontent/${BILINGUAL_SITE_KEY}/en/media`);
    });

    it('respects sitesEnabled config when toggled off', () => {
        updateQuickFindConfigurationViaGraphql({sitesEnabled: false}).then(() => {
            cy.reload();
        });
        // Pages of the other specs match "quick find", and none matches the key of this site.
        searchInModal(FRENCH_SITE_KEY);

        cy.get('[data-quick-find-empty-state="no-results"]', {timeout: LONG_TIMEOUT}).should('be.visible');
        cy.get('[data-quick-find-results-section-key="quick-find-sites"]').should('not.exist');
    });
});
