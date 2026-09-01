import {ensureSiteExists, SITE_KEY} from './quickFindProviders.helpers';

describe('QuickFind test suite setup', () => {
    it('creates the shared test site and enables quick-find when missing', () => {
        ensureSiteExists(SITE_KEY);
    });
});
