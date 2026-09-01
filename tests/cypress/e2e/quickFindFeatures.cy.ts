import {
    MEDIUM_TIMEOUT,
    searchInModal,
    SITE_KEY,
    updateQuickFindConfigurationViaGraphql,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind features provider', () => {
    const setFeaturesProviderEnabled = (enabled: boolean) => {
        return updateQuickFindConfigurationViaGraphql({uiFeaturesEnabled: enabled}).then(() => {
            cy.reload();
        });
    };

    beforeEach(() => {
        visitQuickFindSiteInJContent(SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('returns feature results for page models query', () => {
        searchInModal('page models');

        cy.get('[data-quick-find-panel="true"]').contains('Features', {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').contains(/page\s*models/i, {timeout: MEDIUM_TIMEOUT});
    });

    it('does not return feature results for unknown query', () => {
        searchInModal('quick-find-feature-no-match-xyz');

        cy.get('[data-quick-find-empty-state="no-results"]', {timeout: MEDIUM_TIMEOUT}).should('be.visible');
        cy.get('[data-quick-find-panel="true"]').should('not.contain', 'Features');
    });

    it('respects uiFeaturesEnabled config when toggled off and back on', () => {
        setFeaturesProviderEnabled(false);
        searchInModal('page models');

        cy.get('[data-quick-find-results-section-key="quick-find-features"]').should('not.exist');
        cy.get('[data-quick-find-panel="true"]').should('not.contain', 'Features');

        cy.closeQuickFindModalIfOpen();

        setFeaturesProviderEnabled(true);
        searchInModal('page models');

        cy.get('[data-quick-find-results-section-key="quick-find-features"]', {timeout: MEDIUM_TIMEOUT}).should('be.visible');
    });
});
