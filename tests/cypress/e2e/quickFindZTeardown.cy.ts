import {deleteSite} from '@jahia/cypress';
import {SITE_KEY} from './quickFindProviders.helpers';

describe('QuickFind test suite teardown', () => {
    it('deletes the shared test site', () => {
        if (Cypress.env('QUICK_FIND_KEEP_SITE') === true) {
            cy.log('Skipping site deletion because QUICK_FIND_KEEP_SITE=true');
            return;
        }

        deleteSite(SITE_KEY);
    });
});
