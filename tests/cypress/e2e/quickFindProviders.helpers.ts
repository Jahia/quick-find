// ---------------------------------------------------------------------------
// GraphQL mutations / queries
//
// All requests go through gqlRequest() which uses cy.request() with an explicit
// Origin header. cy.apollo() / cross-fetch cannot set Origin, so Jahia's CSRF
// filter blocks those calls with HTTP 200 + "Permission denied".
// ---------------------------------------------------------------------------

import {createSite, editSite, enableModule} from '@jahia/cypress';

// ---------------------------------------------------------------------------
// Shared timeout constants
// ---------------------------------------------------------------------------

export const SHORT_TIMEOUT = 1000;
export const MEDIUM_TIMEOUT = 2000;
export const LONG_TIMEOUT = 10000;

export const RESULT_ROW_SELECTOR = '[data-quick-find-result-row="true"][tabindex]';
export const SHOW_MORE_SELECTOR = '[data-quick-find-show-more="true"]';
export const SEARCH_INPUT_SELECTOR = '[data-quick-find-search-input-wrapper="true"] input[type="search"]';

export type GraphqlOperation = {operationName?: string; variables?: Record<string, unknown>};

// The operations carried by an intercepted POST to /modules/graphql. The modal queries
// through jContent's Apollo client, which batches: one search sends a single request whose
// body is an array such as [getCurrentUser, JCRMediaByCriteria, JCRNodesByCriteria,
// JCRMainResourcesByCriteria], so `req.body.operationName` is undefined there.
export const graphqlOperations = (body: unknown): GraphqlOperation[] =>
    (Array.isArray(body) ? body : [body]).filter(
        (operation): operation is GraphqlOperation => typeof operation === 'object' && operation !== null
    );

const gqlAuth = () => ({user: 'root', pass: Cypress.env('SUPER_USER_PASSWORD')});

const ADD_NODE_MUTATION = `
mutation addNode($parentPathOrId: String!, $name: String!, $primaryNodeType: String!, $properties: [InputJCRProperty], $mixins: [String]) {
    jcr(workspace: EDIT) {
        addNode(parentPathOrId: $parentPathOrId, name: $name, primaryNodeType: $primaryNodeType, properties: $properties, mixins: $mixins) {
            uuid
        }
    }
}`;

// A jnt:file requires a mandatory jcr:content child (jnt:resource) with both
// jcr:mimeType and jcr:data. The $file variable is the form-field key name;
// Jahia resolves the binary from that field in the multipart body.
const UPLOAD_FILE_MUTATION = `
mutation upload($file: String!, $parentPathOrId: String!, $name: String!) {
    jcr {
        addNode(parentPathOrId: $parentPathOrId, name: $name, primaryNodeType: "jnt:file") {
            addChild(name: "jcr:content", primaryNodeType: "jnt:resource") {
                c: mutateProperty(name: "jcr:data") { setValue(type: BINARY, value: $file) }
                m: mutateProperty(name: "jcr:mimeType") { setValue(value: "text/plain") }
            }
            uuid
        }
    }
}`;

const GET_NODE_BY_PATH_QUERY = `
query getNodeByPath($path: String!) {
    jcr(workspace: EDIT) {
        nodeByPath(path: $path) {
            uuid
        }
    }
}`;

const QUICK_FIND_CONFIG_PID = 'org.jahia.pm.modules.quickfind';

const LOCALHOST_BASE_URL = 'http://jahia:8080';

const asNonEmptyString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const stripTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

const safeParseHostname = (url: string): string | undefined => {
    try {
        return new URL(url).hostname || undefined;
    } catch {
        return undefined;
    }
};

const resolveRuntimeBaseUrl = () => {
    const configuredBaseUrl = asNonEmptyString(Cypress.config('baseUrl'));
    const explicitBaseUrl = asNonEmptyString(Cypress.env('CYPRESS_BASE_URL'));
    const jahiaUrl = asNonEmptyString(Cypress.env('JAHIA_URL'));

    return stripTrailingSlashes(configuredBaseUrl || explicitBaseUrl || jahiaUrl || LOCALHOST_BASE_URL);
};

const resolveSiteServerName = () => {
    const explicitServerName = asNonEmptyString(Cypress.env('QUICK_FIND_SITE_SERVER_NAME'));
    if (explicitServerName) {
        return explicitServerName;
    }

    return safeParseHostname(resolveRuntimeBaseUrl()) || 'localhost';
};

const resolveVanityBaseUrl = () => {
    const explicitVanityBaseUrl = asNonEmptyString(Cypress.env('QUICK_FIND_VANITY_BASE_URL'));
    if (explicitVanityBaseUrl) {
        return stripTrailingSlashes(explicitVanityBaseUrl);
    }

    return stripTrailingSlashes(asNonEmptyString(Cypress.env('JAHIA_URL')) || resolveRuntimeBaseUrl());
};

export const getQuickFindTestRuntimeConfig = () => {
    const baseUrl = resolveRuntimeBaseUrl();
    const siteServerName = resolveSiteServerName();
    const vanityBaseUrl = resolveVanityBaseUrl();

    return {
        baseUrl,
        siteServerName,
        vanityBaseUrl
    };
};

export const isJahiaVanityHostnameStrategy = () => {
    const {vanityBaseUrl} = getQuickFindTestRuntimeConfig();
    return safeParseHostname(vanityBaseUrl) === 'jahia';
};

export const buildVanityLookupUrl = (pathOrSlug: string) => {
    const {vanityBaseUrl} = getQuickFindTestRuntimeConfig();
    const normalizedPath = pathOrSlug.startsWith('/') ? pathOrSlug : `/${pathOrSlug}`;
    return `${vanityBaseUrl}${normalizedPath}`;
};

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

type GraphQLResult = {
    data?: {
        jcr?: {
            addNode?: {uuid?: string} | null;
            nodeByPath?: {uuid?: string} | null;
        } | null;
    } | null;
    errors?: unknown;
};

const formatGraphQLErrors = (errors: unknown) => {
    try {
        return JSON.stringify(errors, null, 2);
    } catch {
        return String(errors);
    }
};

const assertNoGraphQLErrors = (result: GraphQLResult, context: string) => {
    if (result.errors !== undefined) {
        throw new Error(`${context}: ${formatGraphQLErrors(result.errors)}`);
    }
};

const hasPathNotFoundError = (errors: unknown) => {
    if (!Array.isArray(errors)) {
        return false;
    }

    return errors.some(error => {
        const message = (error as {message?: unknown})?.message;
        return typeof message === 'string' && message.includes('PathNotFoundException');
    });
};

const gqlRequest = (body: Record<string, unknown>): Cypress.Chainable<GraphQLResult> =>
    cy
        .request({
            method: 'POST',
            url: '/modules/graphql',
            headers: {
                'Content-Type': 'application/json',
                Origin: Cypress.config('baseUrl')
            },
            auth: gqlAuth(),
            body
        })
        .then(
            (response: Cypress.Response<unknown>) => response.body as GraphQLResult
        ) as unknown as Cypress.Chainable<GraphQLResult>;

// Mirrors InputJCRProperty: `value` for a single value, `values` for a multiple
// property (j:tagList), `language` for an i18n one, and `type` for the JCR property
// type. All four are optional, `type` included: it is a nullable enum with no
// default, and jcr:title and j:templateName below are created without it. A fixture
// passes it only where it wants the stored type spelled out.
export type NodeProperty = {
    name: string;
    language?: string;
    value?: string;
    values?: string[];
    type?: string;
};

const addNode = (variables: {
    parentPathOrId: string;
    name: string;
    primaryNodeType: string;
    properties?: NodeProperty[];
    mixins?: string[];
}) => gqlRequest({query: ADD_NODE_MUTATION, variables});

const getNodeByPath = (path: string) => gqlRequest({query: GET_NODE_BY_PATH_QUERY, variables: {path}});

const waitForNodeByPath = (path: string, timeoutMs = LONG_TIMEOUT, intervalMs = MEDIUM_TIMEOUT) =>
    cy.waitUntil(
        () =>
            getNodeByPath(path).then((result: GraphQLResult) => {
                if (result.errors !== undefined && !hasPathNotFoundError(result.errors)) {
                    assertNoGraphQLErrors(result, `GraphQL errors while waiting for node ${path}`);
                }

                return Boolean(result?.data?.jcr?.nodeByPath?.uuid);
            }),
        {
            timeout: timeoutMs,
            interval: intervalMs,
            errorMsg: `Timed out after ${timeoutMs}ms waiting for node: ${path}`
        }
    );

// Jahia admin configuration mutation expects values as strings, even for
// numeric/boolean settings (e.g. value: "2").
const toGraphqlConfigValueLiteral = (value: string | number | boolean) => JSON.stringify(String(value));

const buildQuickFindConfigMutation = (values: Record<string, string | number | boolean>) => {
    const fields = Object.entries(values)
        .map(
            ([name, value]) => `${name}:value(name:${JSON.stringify(name)},value:${toGraphqlConfigValueLiteral(value)})`
        )
        .join('\n');

    return `
mutation {
    admin {
        jahia {
            configuration(pid:${JSON.stringify(QUICK_FIND_CONFIG_PID)}) {
                ${fields}
            }
        }
    }
}`;
};

export const updateQuickFindConfigurationViaGraphql = (values: Record<string, string | number | boolean>) => {
    const mutation = buildQuickFindConfigMutation(values);

    return gqlRequest({query: mutation}).then(result => {
        assertNoGraphQLErrors(result, 'GraphQL errors while updating quick-find configuration');
        return result;
    });
};

// ---------------------------------------------------------------------------
// Shared test site key
// ---------------------------------------------------------------------------

export const SITE_KEY = 'quick-find-test-site';

const ensuredSites = new Set<string>();

export const ensureSiteExists = (siteKey: string = SITE_KEY) =>
    cy.then(() => {
        const sitePath = `/sites/${siteKey}`;
        const runtimeConfig = getQuickFindTestRuntimeConfig();

        if (ensuredSites.has(siteKey)) {
            return;
        }

        return getNodeByPath(sitePath).then((result: GraphQLResult) => {
            if (result.errors !== undefined && !hasPathNotFoundError(result.errors)) {
                assertNoGraphQLErrors(result, 'GraphQL errors while checking site existence');
            }

            if (result?.data?.jcr?.nodeByPath?.uuid) {
                enableModule('quick-find', siteKey);
                ensuredSites.add(siteKey);
                cy.log(`[quick-find-setup] Reusing existing site: ${siteKey}`);
                return;
            }

            cy.log(`[quick-find-setup] Site ${siteKey} is missing, creating it`);
            cy.log(
                `[quick-find-setup] baseUrl=${runtimeConfig.baseUrl} serverName=${runtimeConfig.siteServerName} vanityBaseUrl=${runtimeConfig.vanityBaseUrl}`
            );

            createSite(siteKey, {
                locale: 'en',
                serverName: runtimeConfig.siteServerName,
                templateSet: 'quick-find-test-module'
            });
            enableModule('quick-find', siteKey);

            return waitForNodeByPath(sitePath).then(() => {
                ensuredSites.add(siteKey);
                cy.log(`[quick-find-setup] Site is ready: ${siteKey}`);
            });
        });
    });

export const visitQuickFindSiteInJContent = (siteKey: string = SITE_KEY) => {
    return ensureSiteExists(siteKey).then(() => {
        cy.visitJContentPage(siteKey);
    });
};

export const setSiteServerName = (serverName: string, siteKey: string = SITE_KEY) =>
    cy.then(() => {
        cy.log(`[quick-find-setup] Updating site ${siteKey} serverName to ${serverName}`);
        editSite(siteKey, {serverName});
        ensuredSites.delete(siteKey);
    });

const pad2 = (value: number) => value.toString().padStart(2, '0');

export const createTestToken = (date = new Date()) => {
    const year = date.getFullYear();
    const day = pad2(date.getDate());
    const month = pad2(date.getMonth() + 1);
    const hours = pad2(date.getHours());
    const minutes = pad2(date.getMinutes());
    const seconds = pad2(date.getSeconds());

    return `${year}${day}${month}-${hours}${minutes}${seconds}`;
};

// ---------------------------------------------------------------------------
// Modal interaction helpers
// ---------------------------------------------------------------------------

// jContent paints a loader overlay over its main area while it loads: ContentLayout's
// (z-index 19999) while a content list loads, then, after /pages redirects to /pages/home,
// EditFrame's TransparentLoaderOverlay (z-index 9999) until the page-builder iframe holds its
// document. Both stack above the quick-find modal overlay (z-index 8000), so a modal opened
// before jContent settles fails `be.visible` with "being covered by another element".
const JCONTENT_LOADER_OVERLAY_SELECTOR = '.flexCol_center.alignCenter:has(> .moonstone-loader)';
const PAGE_BUILDER_FRAME_SELECTOR = 'iframe[data-sel-role="page-builder-frame-active"]';
const JCONTENT_PAGES_ROUTE = /\/jcontent\/[^/]+\/[^/]+\/pages(\/|$)/;

const waitForJContentIdle = () => {
    cy.location('pathname').then(pathname => {
        if (!JCONTENT_PAGES_ROUTE.test(pathname)) {
            return;
        }

        // EditFrame portals #jahia-portal-root into the frame once it holds the frame's
        // document, the same state that lifts its overlay. The pathname may still be /pages
        // here: the wait also spans the redirect to /pages/home.
        cy.get(PAGE_BUILDER_FRAME_SELECTOR, {timeout: 30000}).should($frame => {
            const portalRoot = $frame.contents().find('#jahia-portal-root');
            expect(portalRoot, 'page builder frame loaded the page').to.have.length(1);
        });
    });

    cy.get(JCONTENT_LOADER_OVERLAY_SELECTOR, {timeout: 30000}).should('not.exist');
};

// The Search entry quick-find adds to the level-one navigation (NavSearchButton in routes.tsx).
// Moonstone's PrimaryNavItem renders its label as the <li> title.
const SEARCH_NAV_ITEM_SELECTOR = '.moonstone-primaryNav .moonstone-primaryNavItem[title="Search"]';
const MODAL_SELECTOR = '[data-quick-find-modal="true"]';
const SEARCH_NAV_CLICKS = 10;

// Resolves true as soon as the modal renders, false once withinMs has passed without it.
// Moonstone renders nothing while closed, so "the node exists" is an exact test for "open".
const modalRenders = (win: Cypress.AUTWindow, withinMs: number) =>
    new Cypress.Promise<boolean>(resolve => {
        const deadline = Date.now() + withinMs;
        const check = () => {
            if (win.document.querySelector(MODAL_SELECTOR)) {
                resolve(true);
            } else if (Date.now() > deadline) {
                resolve(false);
            } else {
                setTimeout(check, 50);
            }
        };

        check();
    });

// The button dispatches quick-find:open-search, which maps to setIsOpen(true), so clicking
// it again while the modal is closed is safe. A click that lands before QuickFindModal's
// effect has attached the listener is lost, hence the repeat until the modal renders. The
// modal is checked before each click, the first one included (searchInModal also runs on an
// already open modal): once open, its overlay covers the navigation.
const clickSearchInPrimaryNav = (clicksLeft: number) => {
    cy.document().then(doc => {
        if (doc.querySelector(MODAL_SELECTOR)) {
            return;
        }

        expect(clicksLeft, 'Search clicks left before the modal opens').to.be.greaterThan(0);
        cy.get(SEARCH_NAV_ITEM_SELECTOR, {timeout: LONG_TIMEOUT}).click();
        cy.window()
            .then({timeout: 3000}, win => modalRenders(win, 1000))
            .then(rendered => {
                if (!rendered) {
                    clickSearchInPrimaryNav(clicksLeft - 1);
                }
            });
    });
};

export const openSearchModal = () => {
    const panelSelector = '[data-quick-find-panel="true"]';

    waitForJContentIdle();

    // Coarse gate only: routes.tsx appends the container before createRoot() and render(),
    // so its presence proves mountModal() started, not that QuickFindModal's effect has
    // attached the listener. The generous timeout covers ensureI18nReady()'s network calls.
    cy.get('#quick-find-search-modal', {timeout: 30000}).should('exist');

    clickSearchInPrimaryNav(SEARCH_NAV_CLICKS);

    cy.get(MODAL_SELECTOR, {timeout: LONG_TIMEOUT}).should('be.visible');
    cy.get(panelSelector, {timeout: LONG_TIMEOUT}).should('be.visible');
    cy.get(SEARCH_INPUT_SELECTOR, {timeout: LONG_TIMEOUT}).as('searchInput').should('be.visible');
};

export const closeSearchModal = () => {
    cy.closeQuickFindModalIfOpen();
};

export const searchInModal = (query: string) => {
    openSearchModal();
    cy.get('@searchInput').clear();
    cy.get('@searchInput').type(query);
};

// ---------------------------------------------------------------------------
// Content creation helpers
// ---------------------------------------------------------------------------

// jnt:page requires j:templateName (mandatory constraint). The ensureHomePage
// guard creates /home if createSite's template import hasn't done it yet.
//
// `options` carries what a search fixture needs beyond a title: mixins (e.g.
// jmix:tagged) and the properties they bring (e.g. j:tagList).
export const createPageViaGraphql = (
    siteKey: string,
    pageName: string,
    pageTitle: string,
    options: {mixins?: string[]; properties?: NodeProperty[]} = {}
) => {
    const ensureHomePage = () =>
        getNodeByPath(`/sites/${siteKey}/home`).then((result: GraphQLResult) => {
            if (result?.data?.jcr?.nodeByPath?.uuid) {
                return;
            }

            return addNode({
                parentPathOrId: `/sites/${siteKey}`,
                name: 'home',
                primaryNodeType: 'jnt:page',
                properties: [
                    {name: 'jcr:title', language: 'en', value: 'Home'},
                    {name: 'j:templateName', value: 'base'}
                ]
            }).then((createResult: GraphQLResult) => {
                assertNoGraphQLErrors(createResult, 'GraphQL errors while creating home page');
            });
        });

    return ensureSiteExists(siteKey).then(() =>
        ensureHomePage().then(() =>
            getNodeByPath(`/sites/${siteKey}/home/${pageName}`).then((existing: GraphQLResult) => {
                if (existing?.data?.jcr?.nodeByPath?.uuid) {
                    return existing;
                }

                return addNode({
                    parentPathOrId: `/sites/${siteKey}/home`,
                    name: pageName,
                    primaryNodeType: 'jnt:page',
                    mixins: options.mixins,
                    properties: [
                        {
                            name: 'jcr:title',
                            language: 'en',
                            value: pageTitle
                        },
                        {
                            name: 'j:templateName',
                            value: 'base'
                        },
                        ...(options.properties ?? [])
                    ]
                }).then((result: GraphQLResult) => {
                    assertNoGraphQLErrors(result, 'GraphQL errors while creating page');
                    expect(result?.data?.jcr?.addNode?.uuid, 'created page uuid').to.be.a('string');
                    return result;
                });
            })
        )
    );
};

// Guards against a race between createSite (async Groovy provisioning) and the
// first file-creation call: /files is normally created by the template set
// import, but if it isn't ready yet this will create it as jnt:folder.
// Note: jnt:file nodes require a jnt:folder parent, NOT jnt:contentFolder.
const ensureMediaRoot = (siteKey: string) => {
    const mediaRootPath = `/sites/${siteKey}/files`;

    return getNodeByPath(mediaRootPath).then((result: GraphQLResult) => {
        if (result?.data?.jcr?.nodeByPath?.uuid) {
            return;
        }

        return addNode({
            parentPathOrId: `/sites/${siteKey}`,
            name: 'files',
            primaryNodeType: 'jnt:folder',
            properties: [
                {
                    name: 'jcr:title',
                    language: 'en',
                    value: 'Files'
                }
            ]
        }).then((createResult: GraphQLResult) => {
            assertNoGraphQLErrors(createResult, 'GraphQL errors while creating /files');
        });
    });
};

// Uploads a jnt:file via GraphQL multipart.
//
// cy.request does not serialize FormData correctly, so the multipart body is
// built manually as a raw string. Jahia's convention: the $file variable holds
// the form-field key name (e.g. "filedata"); the server reads the binary from
// that named field — do NOT use the graphql-multipart-spec null+map approach
// (that causes Jahia to store "org.apache...@xxx" as jcr:data).
//
// File content is derived from the filename (hyphens → spaces, no extension)
// so that full-text search can find the file by keyword phrases. Lucene treats
// hyphens as NOT operators, so search terms with hyphens won't match hyphenated
// filenames — content with spaces is more reliably indexed.
const uploadFile = (parentPathOrId: string, name: string): Cypress.Chainable<GraphQLResult> => {
    const boundary = `CypressBoundary${Date.now()}`;
    const fileKey = 'filedata';
    const fileContent = name.replace(/-/g, ' ').replace(/\.\w+$/, '');

    const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="query"`,
        '',
        UPLOAD_FILE_MUTATION,
        `--${boundary}`,
        `Content-Disposition: form-data; name="variables"`,
        '',
        JSON.stringify({file: fileKey, parentPathOrId, name}),
        `--${boundary}`,
        `Content-Disposition: form-data; name="${fileKey}"; filename="${name}"`,
        'Content-Type: text/plain',
        '',
        fileContent,
        `--${boundary}--`
    ].join('\r\n');

    return cy
        .request({
            method: 'POST',
            url: '/modules/graphql',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                Origin: Cypress.config('baseUrl')
            },
            auth: gqlAuth(),
            body
        })
        .then(
            (response: Cypress.Response<unknown>) => response.body as GraphQLResult
        ) as unknown as Cypress.Chainable<GraphQLResult>;
};

export const createMediaViaGraphql = (siteKey: string, fileName: string) =>
    ensureSiteExists(siteKey).then(() =>
        ensureMediaRoot(siteKey).then(() =>
            uploadFile(`/sites/${siteKey}/files`, fileName).then((result: GraphQLResult) => {
                assertNoGraphQLErrors(result, 'GraphQL errors while creating media');
                expect(result?.data?.jcr?.addNode?.uuid, 'created media uuid').to.be.a('string');
                return result;
            })
        )
    );

// The quickfindtest:mainResource type (defined in the quick-find-test-module CND) extends
// jnt:content + jmix:mainResource. It cannot be placed under jnt:contentFolder
// — only under jnt:page (e.g. /home). The quick-find main-resources provider
// searches site-wide via pathType: ANCESTOR, so location doesn't affect results.
export const createMainResourceViaGraphql = (siteKey: string, nodeName: string, title: string) =>
    ensureSiteExists(siteKey).then(() =>
        addNode({
            parentPathOrId: `/sites/${siteKey}/home`,
            name: nodeName,
            primaryNodeType: 'quickfindtest:mainResource',
            properties: [
                {
                    name: 'jcr:title',
                    language: 'en',
                    value: title
                }
            ]
        }).then((result: GraphQLResult) => {
            assertNoGraphQLErrors(result, 'GraphQL errors while creating main resource');
            expect(result?.data?.jcr?.addNode?.uuid, 'created main resource uuid').to.be.a('string');
            return result;
        })
    );
