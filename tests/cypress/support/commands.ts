// ***********************************************
// Custom commands for kfind Cypress tests
// ***********************************************

import 'cypress-wait-until';

// Augment Cypress's global Chainable type so TypeScript recognizes
// custom commands added in this file (e.g. cy.visitJContentPage()).
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Cypress {
        interface Chainable {
            visitJContentPage(siteKey: string, language?: string, app?: string): Chainable<void>;
            closeKfindModalIfOpen(): Chainable<void>;
        }
    }
}

Cypress.Commands.add('visitJContentPage', (siteKey: string, language = 'en', app = 'pages') => {
    cy.login();
    cy.visit(`/jahia/jcontent/${siteKey}/${language}/${app}`);
    cy.get('body', {timeout: 30000}).should('be.visible');
});

Cypress.Commands.add('closeKfindModalIfOpen', () => {
    cy.get('body').then($body => {
        if ($body.find('[data-kfind-panel="true"]').length === 0) {
            return;
        }

        cy.get('body').type('{esc}');
        cy.get('[data-kfind-panel="true"]').should('not.exist');
    });
});
