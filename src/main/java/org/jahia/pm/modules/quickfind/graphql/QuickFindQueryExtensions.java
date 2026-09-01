package org.jahia.pm.modules.quickfind.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNode;
import org.jahia.modules.graphql.provider.dxm.node.GqlJcrNodeImpl;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.content.JCRContentUtils;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.seo.VanityUrl;
import org.jahia.services.seo.jcr.VanityUrlManager;
import org.jahia.services.seo.jcr.VanityUrlService;
import org.jahia.services.sites.JahiaSitesService;
import org.apache.commons.lang.StringUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.RepositoryException;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Extends the Jahia GraphQL Query type with a {@code fuzzyUrlAndPathLookup}
 * field.
 * <p>
 * Given a live website URL, this extension resolves matching JCR nodes by:
 * <ol>
 * <li>Parsing the URL path</li>
 * <li>Building candidate paths (raw, /sites/{siteKey}+path,
 * /sites/{siteKey}/home+path)</li>
 * <li>Resolving each candidate via {@link URLResolverFactory}</li>
 * <li>Returning all resolved nodes in resolver order (duplicates may
 * occur)</li>
 * </ol>
 */
@GraphQLTypeExtension(DXGraphQLProvider.Query.class)
@GraphQLDescription("quick-find URL reverse lookup extension")
public class QuickFindQueryExtensions {

    private static final Logger logger = LoggerFactory.getLogger(QuickFindQueryExtensions.class);

    private static final Pattern SITE_KEY_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]+$");

    /**
     * Resolve a live website URL to all matching JCR nodes.
     *
     * @param url     the full URL or path fragment to look up
     * @param siteKey the Jahia site key to scope the search
     * @return a list of matching GqlJcrNode instances (may be empty)
     */
    @GraphQLField
    @GraphQLName("fuzzyUrlAndPathLookup")
    @GraphQLDescription("Resolve a live website URL to its JCR nodes via vanity URL or direct path matching")
    public static List<GqlJcrNode> fuzzyUrlAndPathLookup(
            @GraphQLNonNull @GraphQLName("url") @GraphQLDescription("The URL or path to look up") String url,
            @GraphQLNonNull @GraphQLName("siteKey") @GraphQLDescription("The Jahia site key") String siteKey) {
        logger.debug("[fuzzyUrlAndPathLookup] START — url='{}' siteKey='{}'", url, siteKey);

        // Prevent DoS through extremely long input URLs
        if (url != null && url.length() > 2000) {
            logger.info("[fuzzyUrlAndPathLookup] Rejected — url exceeds maximum length of 2000 characters");
            throw new IllegalArgumentException("URL exceeds maximum allowed length of 2000 characters");
        }

        if (!SITE_KEY_PATTERN.matcher(siteKey).matches()) {
            logger.info("[fuzzyUrlAndPathLookup] Rejected — siteKey '{}' fails validation pattern", siteKey);
            throw new IllegalArgumentException("Invalid site key: " + siteKey);
        }

        try {
            JCRSessionWrapper session = JCRSessionFactory.getInstance()
                    .getCurrentUserSession("default");
            String workspace = session.getWorkspace().getName();

            List<GqlJcrNode> results = resolveCandidates(url, siteKey, workspace, session);

            return results;
        } catch (RepositoryException e) {
            logger.warn("[fuzzyUrlAndPathLookup] RepositoryException for url='{}': {}", url, e.getMessage(), e);
            throw new RuntimeException("Error during URL reverse lookup: " + e.getMessage(), e);
        }
    }

    private static List<GqlJcrNode> resolveCandidates(
            String url,
            String siteKey,
            String workspace,
            JCRSessionWrapper session) {
        List<GqlJcrNode> results = new ArrayList<>();
        LinkedHashSet<String> candidates = buildAlternativesUrlsCandidates(url, siteKey);

        for (String candidate : candidates) {
            Optional<GqlJcrNode> byPath = resolveByPath(candidate, session);
            byPath.ifPresent(results::add);

            List<GqlJcrNode> byVanity = resolveWithVanityUrlService(candidate, siteKey, session);
            results.addAll(byVanity);
        }

        return results;
    }

    /**
     * Extracts the path from a URL string. Handles both full URLs and plain paths.
     */
    private static String extractPath(String url) {

        String rawPath;
        if (url == null || url.isEmpty()) {
            rawPath = "/";
        } else {
            try {
                if (url.endsWith(".html")) {
                    url = url.substring(0, url.length() - ".html".length());
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    URI uri = URI.create(url);
                    String path = uri.getPath();
                    if (path == null || path.isEmpty()) {
                        rawPath = "/";
                    } else {
                        rawPath = path;
                    }
                } else {
                    rawPath = url.startsWith("/") ? url : "/" + url;
                }
            } catch (IllegalArgumentException e) {
                // Not a valid URI — treat as a path
                rawPath = url.startsWith("/") ? url : "/" + url;
            }
        }

        String normalized = rawPath.startsWith("/") ? rawPath : "/" + rawPath;
        if (normalized.length() > 1 && normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }

        return normalized;
    }

    /**
     * Builds candidate JCR paths for URL resolution.
     * <p>
     * Tries three strategies in order:
     * 1. Raw path as-is (e.g. standard JCR paths)
     * 2. /sites/{siteKey}/path (e.g. direct vanity URLs)
     * 3. /sites/{siteKey}/home/path (common Jahia structure)
     * <p>
     * Additionally, if the extracted path starts with a language prefix
     * (e.g. {@code /fr/...} or {@code /en-us/...}) matching one of the site's
     * configured languages, a second set of candidates is generated with the
     * language prefix stripped.
     *
     * @param url     The raw input URL/path provided to fuzzyUrlAndPathLookup
     * @param siteKey The targeted site key
     * @return Ordered unique candidate paths generated from the input URL
     */
    private static LinkedHashSet<String> buildAlternativesUrlsCandidates(String url, String siteKey) {
        String siteRoot = "/sites/" + siteKey;
        LinkedHashSet<String> candidates = new LinkedHashSet<>();

        candidates.add(url);
        if (url.endsWith(".html")) {
            candidates.add(url.substring(0, url.length() - ".html".length()));
        }

        String path = extractPath(url);

        candidates.add(path);

        candidates.add(siteRoot + path);
        candidates.add(siteRoot + "/home" + path);

        // If the path starts with a language prefix (e.g. /fr/ or /en-us/),
        // add candidates with the language segment stripped.
        Optional<String> langFreePath = stripLanguagePrefix(path, siteKey);
        if (langFreePath.isPresent()) {
            String stripped = langFreePath.get();
            candidates.add(stripped);
            candidates.add(siteRoot + stripped);
            candidates.add(siteRoot + "/home" + stripped);
        }

        for (String candidate : candidates) {
            logger.debug("[buildAlternativesUrls] candidate: {}", candidate);
        }

        return candidates;
    }

    /**
     * If the first segment of {@code path} is a language code configured on the
     * given site, returns the path without that segment. Otherwise returns empty.
     * <p>
     * Examples (assuming "fr" and "en-us" are site languages):
     * <ul>
     * <li>{@code /fr/contents/page} → {@code /contents/page}</li>
     * <li>{@code /en-us/contents/page} → {@code /contents/page}</li>
     * <li>{@code /contents/page} → empty (no language prefix)</li>
     * </ul>
     */
    private static Optional<String> stripLanguagePrefix(String path, String siteKey) {
        if (path == null || path.length() < 2 || !path.startsWith("/")) {
            return Optional.empty();
        }

        // Extract the first segment: "/fr/contents/..." → "fr"
        int secondSlash = path.indexOf('/', 1);
        if (secondSlash == -1) {
            // Path is just "/fr" — nothing after the language prefix
            return Optional.empty();
        }

        String firstSegment = path.substring(1, secondSlash);
        if (firstSegment.isEmpty()) {
            return Optional.empty();
        }

        try {
            Set<String> siteLanguages = JahiaSitesService.getInstance()
                    .getSiteByKey(siteKey).getLanguages();

            if (siteLanguages != null && siteLanguages.contains(firstSegment)) {
                String remainder = path.substring(secondSlash);
                logger.debug("[stripLanguagePrefix] stripped language '{}' from path '{}' → '{}'",
                        firstSegment, path, remainder);
                return Optional.of(remainder);
            }
        } catch (Exception e) {
            logger.debug("[stripLanguagePrefix] could not check site languages for siteKey='{}': {}",
                    siteKey, e.getMessage());
        }

        return Optional.empty();
    }

    private static Optional<GqlJcrNode> resolveByPath(String path, JCRSessionWrapper session) {
        if (path == null || path.isEmpty() || "/".equals(path)) {
            return Optional.empty();
        }

        try {
            String escapedPath = JCRContentUtils.escapeNodePath(path);
            if (!session.nodeExists(escapedPath)) {
                return Optional.empty();
            }

            JCRNodeWrapper node = session.getNode(escapedPath);
            return Optional.of(new GqlJcrNodeImpl(node));
        } catch (RepositoryException e) {
            logger.info("[resolveByPath] RepositoryException while resolving path='{}'", path, e);
            return Optional.empty();
        } catch (RuntimeException e) {
            logger.info("[resolveByPath] RuntimeException while resolving path='{}'", path, e);
            return Optional.empty();
        }
    }

    private static List<GqlJcrNode> resolveWithVanityUrlService(
            String path,
            String siteKey,
            JCRSessionWrapper session) {

        List<GqlJcrNode> resolvedNodes = new ArrayList<>();

        VanityUrlService vanityUrlService = BundleUtils.getOsgiService(VanityUrlService.class, null);

        if (vanityUrlService == null) {
            logger.warn("[resolveWithVanityUrlService] VanityUrlService OSGi service unavailable");
            return resolvedNodes;
        }

        if (path == null || path.isEmpty() || "/".equals(path)) {
            return resolvedNodes;
        }

        try {
            List<VanityUrl> urls = vanityUrlService.findExistingVanityUrls(
                    path, siteKey, session.getWorkspace().getName());

            for (VanityUrl vanityUrl : urls) {
                String nodePath = StringUtils.substringBefore(vanityUrl.getPath(),
                        "/" + VanityUrlManager.VANITYURLMAPPINGS_NODE + "/");

                if (nodePath == null || nodePath.isEmpty()) {
                    continue;
                }

                if (!session.nodeExists(nodePath)) {
                    continue;
                }

                JCRNodeWrapper node = session.getNode(nodePath);
                logger.info("[resolveWithVanityUrlService] resolved vanity URL — path='{}' nodePath='{}' type='{}'",
                        path, nodePath, node.getPrimaryNodeType().getName());
                resolvedNodes.add(new GqlJcrNodeImpl(node));
            }
        } catch (RepositoryException e) {
            logger.info("[resolveWithVanityUrlService] RepositoryException for path='{}' siteKey='{}': {}",
                    path, siteKey, e.getMessage(), e);
        } catch (RuntimeException e) {
            logger.info("[resolveWithVanityUrlService] RuntimeException for path='{}' siteKey='{}': {}",
                    path, siteKey, e.getMessage(), e);
        }

        return resolvedNodes;
    }

}
