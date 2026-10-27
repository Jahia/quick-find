import {
    SITE_KEY,
    updateQuickFindConfigurationViaGraphql,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind configuration', () => {
    after('Restore the configuration', () => {
        updateQuickFindConfigurationViaGraphql({
            minSearchChars: 3,
            defaultDisplayedResults: 5,
            sitesEnabled: true,
            uiFeaturesEnabled: true
        });
    });

    it('ignores a malformed value and keeps the other values', () => {
        updateQuickFindConfigurationViaGraphql({
            minSearchChars: '3a',
            defaultDisplayedResults: '010',
            sitesEnabled: false,
            uiFeaturesEnabled: 'True'
        });
        visitQuickFindSiteInJContent(SITE_KEY);

        cy.window()
            .its('contextJsParameters.quickFind')
            .should(quickFind => {
                expect(quickFind, 'quick-find configuration').to.exist;
                expect(quickFind.minSearchChars, 'minSearchChars').to.be.undefined;
                expect(quickFind.uiFeaturesEnabled, 'uiFeaturesEnabled').to.be.undefined;
                expect(quickFind.defaultDisplayedResults, 'defaultDisplayedResults').to.equal(10);
                expect(quickFind.sitesEnabled, 'sitesEnabled').to.equal(false);
            });
    });
});
