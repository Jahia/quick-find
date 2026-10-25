<%@ page language="java" contentType="text/javascript" import="java.util.Date" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="utility" uri="http://www.jahia.org/tags/utilityLib" %>
<%@ taglib prefix="functions" uri="http://www.jahia.org/tags/functions" %>
<% String buildTime = new Date().toString(); %>
<c:set var="quickFindConfig" value="${functions:getConfigValues('org.jahia.pm.modules.quickfind')}"/>
<%-- A key that an older .cfg lacks prints undefined, so configUtils.ts applies its default. A module upgrade keeps the existing .cfg. --%>
<c:choose>
    <c:when test="${! empty quickFindConfig}">
        contextJsParameters.quickFind={buildTime:"<%= buildTime %>",
            minSearchChars:${empty quickFindConfig['minSearchChars'] ? 'undefined' : quickFindConfig['minSearchChars']},
            defaultDisplayedResults:${empty quickFindConfig['defaultDisplayedResults'] ? 'undefined' : quickFindConfig['defaultDisplayedResults']},
            augmentedFindDelayInTypingToLaunchSearch:${empty quickFindConfig['augmentedFindDelayInTypingToLaunchSearch'] ? 'undefined' : quickFindConfig['augmentedFindDelayInTypingToLaunchSearch']},
            jcrFindDelayInTypingToLaunchSearch:${empty quickFindConfig['jcrFindDelayInTypingToLaunchSearch'] ? 'undefined' : quickFindConfig['jcrFindDelayInTypingToLaunchSearch']},
            sitesEnabled:${empty quickFindConfig['sitesEnabled'] ? 'undefined' : quickFindConfig['sitesEnabled']},
            sitesMaxResults:${empty quickFindConfig['sitesMaxResults'] ? 'undefined' : quickFindConfig['sitesMaxResults']},
            uiFeaturesEnabled:${empty quickFindConfig['uiFeaturesEnabled'] ? 'undefined' : quickFindConfig['uiFeaturesEnabled']},
            uiFeaturesMaxResults:${empty quickFindConfig['uiFeaturesMaxResults'] ? 'undefined' : quickFindConfig['uiFeaturesMaxResults']},
            jcrMediaEnabled:${empty quickFindConfig['jcrMediaEnabled'] ? 'undefined' : quickFindConfig['jcrMediaEnabled']},
            jcrMediaMaxResults:${empty quickFindConfig['jcrMediaMaxResults'] ? 'undefined' : quickFindConfig['jcrMediaMaxResults']},
            jcrPagesEnabled:${empty quickFindConfig['jcrPagesEnabled'] ? 'undefined' : quickFindConfig['jcrPagesEnabled']},
            jcrPagesMaxResults:${empty quickFindConfig['jcrPagesMaxResults'] ? 'undefined' : quickFindConfig['jcrPagesMaxResults']},
            jcrMainResourcesEnabled:${empty quickFindConfig['jcrMainResourcesEnabled'] ? 'undefined' : quickFindConfig['jcrMainResourcesEnabled']},
            jcrMainResourcesMaxResults:${empty quickFindConfig['jcrMainResourcesMaxResults'] ? 'undefined' : quickFindConfig['jcrMainResourcesMaxResults']},
            urlReverseLookupEnabled:${empty quickFindConfig['urlReverseLookupEnabled'] ? 'undefined' : quickFindConfig['urlReverseLookupEnabled']}
        }
        console.debug("%c quick-find config is added to contextJsParameters", "color: #3c8cba");
    </c:when>
    <c:otherwise>
        <utility:logger level="warn" value="quick-find configuration is not available"/>
        console.warn("quick-find configuration is not available");
    </c:otherwise>
</c:choose>
