import {defineConfig} from 'cypress';

export default defineConfig({
    chromeWebSecurity: false,
    defaultCommandTimeout: 2000,
    video: true,
    reporter: 'cypress-multi-reporters',
    reporterOptions: {
        configFile: 'reporter-config.json'
    },
    screenshotsFolder: './results/screenshots',
    videosFolder: './results/videos',
    viewportWidth: 1366,
    viewportHeight: 768,
    watchForFileChanges: false,
    e2e: {
        setupNodeEvents(on, config) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('cypress-terminal-report/src/installLogsPrinter')(on);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('./cypress/plugins/index.js')(on, config);
        },
        specPattern: [
            'cypress/e2e/quickFind0Setup.cy.ts',
            'cypress/e2e/quickFindEdgeCases.cy.ts',
            'cypress/e2e/quickFindUrlReverseLookup.cy.ts',
            'cypress/e2e/quickFindFeatures.cy.ts',
            'cypress/e2e/quickFindMainResources.cy.ts',
            'cypress/e2e/quickFindMedia.cy.ts',
            'cypress/e2e/quickFindInteraction.cy.ts',
            'cypress/e2e/quickFindPages.cy.ts',
            'cypress/e2e/quickFindPagination.cy.ts',
            'cypress/e2e/quickFindZTeardown.cy.ts'
        ],
        excludeSpecPattern: '*.ignore.ts',
        baseUrl: process.env.CYPRESS_BASE_URL || process.env.JAHIA_URL || 'http://jahia:8080'
    }
});
