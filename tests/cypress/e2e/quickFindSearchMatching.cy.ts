// ---------------------------------------------------------------------------
// What the search box matches.
//
// Every case here mirrors a behaviour measured against a live Jahia 8.2 through
// /modules/graphql. `contains` reads the Lucene index (lowercased, accent-folded,
// stemmed, tokenized) and `like` reads the raw stored property value, so the
// constraint the providers send carries several clauses and each clause catches
// input the others miss. These tests assert the user-visible outcome of that
// constraint: they never look at the query itself, only at what the panel shows.
//
// Fixtures are pages, so every expected hit lands in the Pages section.
// ---------------------------------------------------------------------------

import {
    createPageViaGraphql,
    createTestToken,
    LONG_TIMEOUT,
    MEDIUM_TIMEOUT,
    openSearchModal,
    RESULT_ROW_SELECTOR,
    SHORT_TIMEOUT,
    SITE_KEY,
    updateQuickFindConfigurationViaGraphql,
    visitQuickFindSiteInJContent
} from './quickFindProviders.helpers';

const PANEL_SELECTOR = '[data-quick-find-panel="true"]';
const HINT_STATE_SELECTOR = '[data-quick-find-empty-state="hint"]';
const NO_RESULTS_STATE_SELECTOR = '[data-quick-find-empty-state="no-results"]';

// Three characters is the shortest token the constraint builder still wraps in
// wildcards, so the gate has to be at 3 for this spec. These are also the values
// quickFindEdgeCases leaves behind and every later spec runs under, so there is
// nothing to restore afterwards: an after() hook putting the shipped 4 / 300 back
// would change the environment for the seven specs that follow this one.
const SPEC_MIN_SEARCH_CHARS = 3;
const SPEC_SEARCH_DEBOUNCE = 80;

// The three JCR providers each send one of these operations per search.
const JCR_SEARCH_OPERATIONS = ['JCRNodesByCriteria', 'JCRMediaByCriteria', 'JCRMainResourcesByCriteria'];

const countJcrSearchRequests = (counter: {value: number}) => {
    cy.intercept('POST', '**/modules/graphql', req => {
        const operationName = typeof req.body?.operationName === 'string' ? req.body.operationName : '';

        if (JCR_SEARCH_OPERATIONS.includes(operationName)) {
            counter.value++;
        }
    });
};

// Clearing the input drops below the minimum length, which resets every provider.
// Asserting the hint state before typing is what makes the assertion that follows
// trustworthy: it cannot pass on the rows left over by the previous term.
const searchFresh = (term: string) => {
    openSearchModal();
    cy.get('@searchInput').clear();
    cy.get(HINT_STATE_SELECTOR, {timeout: MEDIUM_TIMEOUT}).should('be.visible');
    cy.get('@searchInput').type(term);
};

const expectMatches = (term: string, titles: string[]) => {
    searchFresh(term);
    titles.forEach(title => {
        cy.get(PANEL_SELECTOR).contains(title, {timeout: LONG_TIMEOUT}).should('be.visible');
    });
};

// Runs after expectMatches, whose visibility check proves the response has rendered,
// so an absent title here is a title the query did not return.
const expectAbsent = (titles: string[]) => {
    titles.forEach(title => {
        cy.get(PANEL_SELECTOR).should('not.contain', title);
    });
};

const expectNoMatch = (term: string) => {
    searchFresh(term);
    cy.get(NO_RESULTS_STATE_SELECTOR, {timeout: LONG_TIMEOUT}).should('be.visible');
    cy.get(RESULT_ROW_SELECTOR).should('not.exist');
};

describe('QuickFind search matching', () => {
    const token = createTestToken();

    // An accent in the title, and a node name that carries none of it.
    const accentTitle = `Châteaux et Haras ${token}`;
    // A plural whose indexed form is a shorter stem: the complete word is matched by
    // the analyzed clause, not by the wildcard one.
    const stemTitle = `Quick find policies ${token}`;
    // "kestrel" appears in the node name only, never in the title.
    const nodeNameTitle = `Quick find unrelated heading ${token}`;
    // The tag word appears neither in the title nor in the node name.
    const taggedTitle = `Quick find tagged item ${token}`;
    const tagWord = 'marmotquickfind';
    const punctuationTitle = `Quick find privacy notice ${token}`;
    const percentTitle = `Quick find 50% rebate ${token}`;
    // Punctuation the analyzer drops, and that only the raw stored value keeps.
    const rawValueTitle = `Quick find C++ handbook ${token}`;
    // "or" between two words an editor really wrote: the raw title is what makes a
    // query holding a bare OR verifiable, because the like clause matches it whatever
    // the analyzer does with the word "or".
    const bareOrTitle = `Quick find heron or egret ${token}`;
    // One title holds both animals and two hold one each: a two-word search has to
    // return the first and neither of the others.
    const bothWordsTitle = `Quick find quokka narwhal ${token}`;
    const firstWordTitle = `Quick find quokka ${token}`;
    const secondWordTitle = `Quick find narwhal ${token}`;

    before('Seed content and lower the minimum search length', () => {
        cy.login();

        updateQuickFindConfigurationViaGraphql({
            minSearchChars: SPEC_MIN_SEARCH_CHARS,
            jcrFindDelayInTypingToLaunchSearch: SPEC_SEARCH_DEBOUNCE
        });

        createPageViaGraphql(SITE_KEY, `quick-find-accent-${token}`, accentTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-stem-${token}`, stemTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-kestrel-${token}`, nodeNameTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-tagged-${token}`, taggedTitle, {
            mixins: ['jmix:tagged'],
            properties: [{name: 'j:tagList', values: [tagWord], type: 'STRING'}]
        });
        createPageViaGraphql(SITE_KEY, `quick-find-privacy-${token}`, punctuationTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-percent-${token}`, percentTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-plus-${token}`, rawValueTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-bare-or-${token}`, bareOrTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-both-words-${token}`, bothWordsTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-quokka-${token}`, firstWordTitle);
        createPageViaGraphql(SITE_KEY, `quick-find-narwhal-${token}`, secondWordTitle);
    });

    beforeEach(function () {
        visitQuickFindSiteInJContent(SITE_KEY);

        const currentTestTitle = this.currentTest?.fullTitle() || 'unknown test';
        cy.log(`[quick-find-test] ${currentTestTitle}`);
    });

    afterEach(() => {
        cy.closeQuickFindModalIfOpen();
    });

    it('finds an accented title from unaccented, accented and uppercase input', () => {
        // The index folds accents on both sides, so all three reach the same term.
        expectMatches('chateaux', [accentTitle]);
        expectMatches('châteaux', [accentTitle]);
        expectMatches('CHATEAUX', [accentTitle]);
    });

    it('finds a title from a fragment inside a word and from a three-character prefix', () => {
        // A wildcard term skips the analyzer, so the caller folds and lowercases it
        // first: without that fold the accented fragment would match nothing.
        expectMatches('hateau', [accentTitle]);
        expectMatches('hâteau', [accentTitle]);
        expectMatches('cha', [accentTitle]);
    });

    it('still finds a complete word whose indexed form is a shorter stem', () => {
        // The index holds the stem of a plural, and a wildcard term is compared to
        // that stem: *policies* finds nothing. This case does not isolate the plain
        // analyzed clause though: measured, the like clause on jcr:title matches the
        // raw title too, so deleting the analyzed clause would leave this test green.
        // The unaccented 'chateaux' case above is the one that isolates that clause —
        // the raw title carries the accent, so no like clause can answer it, and the
        // index holds the stem, so no wildcard clause can either.
        expectMatches('policies', [stemTitle]);
    });

    it('finds a node by a word that only its name carries', () => {
        // The word is in the node name and nowhere in the title, but that does not
        // isolate the j:nodename like clause: measured, an unscoped contains matches
        // this node too, because the node name reaches the aggregated node text. No
        // case in this spec isolates that clause; what is asserted here is the
        // user-visible outcome, that the node name is searchable at all.
        expectMatches('kestrel', [nodeNameTitle]);
    });

    it('finds a node by a word that only its tags carry', () => {
        // The j:tagList property is declared nofulltext, which keeps it out of the
        // aggregated node text: the property-scoped clause is the only one that answers.
        expectMatches(tagWord, [taggedTitle]);
    });

    it('returns results for punctuation that breaks the full-text parser', () => {
        // Each of these raises "Invalid full text search expression" when it reaches
        // contains unchanged, and one bad clause fails the whole any[] list.
        expectMatches('privacy!', [punctuationTitle]);
        expectMatches('privacy(', [punctuationTitle]);
        expectMatches('"privacy', [punctuationTitle]);
    });

    it('returns results for a term that starts with a hyphen', () => {
        // A leading hyphen is the full-text NOT operator, and "--" is a parse error.
        expectMatches('-privacy', [punctuationTitle]);
        expectMatches('--privacy', [punctuationTitle]);
    });

    it('returns results for a query that holds a bare OR', () => {
        // Uppercase OR is a full-text operator and raises a parse error, which fails
        // the whole any[] list and empties the panel. Lowercasing the input in the
        // caller turns it back into an ordinary word, and the fixture title holds that
        // word, so a hit here is the proof that nothing threw.
        expectMatches('heron OR egret', [bareOrTitle]);
    });

    it('treats a percent sign and an underscore as text, not as wildcards', () => {
        const requests = {value: 0};
        const beforeWildcards = {value: 0};
        countJcrSearchRequests(requests);

        // The percent sign an editor typed does not keep the term from matching.
        // This hit on its own proves nothing about the escaping: measured, a bare
        // contains on "50" matches the same fixture, so the clause that answered
        // cannot be told from here. The escaping is proved by the two expectNoMatch
        // cases below, which would return every node of the site unescaped.
        expectMatches('50%', [percentTitle]);

        // The count is snapshotted here, after the searches this phase fired: what the
        // assertion below has to prove is that the two wildcard terms fired a search of
        // their own, and a counter read from zero would be satisfied by this one.
        cy.then(() => {
            beforeWildcards.value = requests.value;
        });

        // Unescaped, "%%%%" and "____" are SQL wildcards and would return every node
        // of the site. The delta proves the empty panel is an empty result set and
        // not a query that never left.
        expectNoMatch('%%%%');
        expectNoMatch('____');

        cy.then(() => {
            expect(
                requests.value - beforeWildcards.value,
                'JCR searches fired for the wildcard characters'
            ).to.be.greaterThan(0);
        });
    });

    it('finds a title by punctuation that the index drops', () => {
        // The analyzer drops the plus signs, but it still emits the token "c" from
        // "C++": measured, a contains clause matches this fixture, so the case does
        // not ride on the like clauses and does not isolate them. No case in this
        // spec isolates a like clause; what is asserted here is that a term written
        // with punctuation still finds the page instead of failing the query.
        expectMatches('c++', [rawValueTitle]);
    });

    it('requires every word typed, whatever their case', () => {
        // The wildcard clauses sit in a nested all group, so a second word narrows the
        // result instead of widening it: the node holding both words answers, and the
        // two nodes holding one word each do not.
        expectMatches('quokka narwhal', [bothWordsTitle]);
        expectAbsent([firstWordTitle, secondWordTitle]);

        expectMatches('QUOKKA NARWHAL', [bothWordsTitle]);
        expectAbsent([firstWordTitle, secondWordTitle]);
    });

    it('finds every node carrying a single word typed on its own', () => {
        // The counterpart of the test above: one word still reaches every node that
        // holds it, so narrowing on two words is the only thing that changed.
        expectMatches('quokka', [firstWordTitle, bothWordsTitle]);
    });

    it('requires a second word that is too short to carry wildcards', () => {
        // "zz" is below the three-character gate, so it joins the nested all group in
        // its analyzed form instead of being wrapped in wildcards. It has to join it:
        // a group holding "*quokka*" alone re-widens what the analyzed clause
        // narrowed, and this query then returns the two quokka nodes the test above
        // lists. Measured live, the constraint built here returns nothing, and
        // dropping the short token from the group is the defect this case catches.
        expectNoMatch('quokka zz');
    });

    it('issues no query while the input holds only whitespace', () => {
        const requests = {value: 0};
        countJcrSearchRequests(requests);

        openSearchModal();
        cy.get('@searchInput').clear();
        cy.get('@searchInput').type('     ');
        cy.get(HINT_STATE_SELECTOR, {timeout: MEDIUM_TIMEOUT}).should('be.visible');

        // A query would leave after the debounce, so the negative only carries meaning
        // once that delay has passed.
        cy.wait(SHORT_TIMEOUT);
        cy.then(() => {
            expect(requests.value, 'JCR searches fired for whitespace-only input').to.equal(0);
        });

        // Positive control: the same counter moves as soon as a real term is typed.
        cy.get('@searchInput').type('chateaux');
        cy.get(PANEL_SELECTOR).contains(accentTitle, {timeout: LONG_TIMEOUT}).should('be.visible');
        cy.then(() => {
            expect(requests.value, 'JCR searches fired for a real term').to.be.greaterThan(0);
        });
    });
});
