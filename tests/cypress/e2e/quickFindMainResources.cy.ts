import {
    createMainResourceViaGraphql,
    createTestToken,
    MEDIUM_TIMEOUT,
    searchInModal,
    SITE_KEY,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

describe('QuickFind main resources provider', () => {
    const token = createTestToken();
    const exactTitle = `quick-find main resource exact ${token}`;
    const broaderTitle = `quick-find main resource broader ${token}`;

    before('Seed main resources via GraphQL', () => {
        cy.login();

        createMainResourceViaGraphql(SITE_KEY, `quick-find-main-resource-exact-${token}`, exactTitle);
        createMainResourceViaGraphql(SITE_KEY, `quick-find-main-resource-broader-${token}`, broaderTitle);

        cy.wrap([...Array(8).keys()]).each(index => {
            createMainResourceViaGraphql(
                SITE_KEY,
                `quick-find-main-resource-bulk-${token}-${index}`,
                `quick-find main resource bulk ${token} item ${index}`
            );
        });
    });

    beforeEach(() => {
        visitQuickFindSiteInJContent(SITE_KEY);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('finds a main resource created via GraphQL', () => {
        searchInModal(exactTitle);

        cy.get('[data-quick-find-panel="true"]').contains(/Main Resource/i, {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').contains(exactTitle, {timeout: MEDIUM_TIMEOUT});
    });

    it('filters main resource results by query term', () => {
        searchInModal(`exact ${token}`);

        cy.get('[data-quick-find-panel="true"]').contains(/Main Resource/i, {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').contains(exactTitle, {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-panel="true"]').should('not.contain', broaderTitle);
    });

    it('shows more main resource results after clicking Show more', () => {
        searchInModal(`quick-find main resource bulk ${token}`);

        cy.get('[data-quick-find-panel="true"]').contains(/Main Resource/i, {timeout: MEDIUM_TIMEOUT});
        cy.get('[data-quick-find-result-row="true"][tabindex]', {timeout: MEDIUM_TIMEOUT})
            .its('length')
            .then(initialCount => {
                const countBefore = Number(initialCount);
                expect(countBefore).to.be.greaterThan(0);

                cy.get('[data-quick-find-show-more="true"]', {timeout: MEDIUM_TIMEOUT}).first().click();

                cy.get('[data-quick-find-result-row="true"][tabindex]', {timeout: MEDIUM_TIMEOUT})
                    .its('length')
                    .should('be.greaterThan', countBefore);
            });
    });
});
