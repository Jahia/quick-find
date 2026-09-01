<%@ page language="java" contentType="text/javascript" import="java.util.Date" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="utility" uri="http://www.jahia.org/tags/utilityLib" %>
<%@ taglib prefix="functions" uri="http://www.jahia.org/tags/functions" %>
<% String buildTime = new Date().toString(); %>
<c:set var="quickFindConfig" value="${functions:getConfigValues('org.jahia.pm.modules.quickfind')}"/>
<c:choose>
    <c:when test="${! empty quickFindConfig}">
        contextJsParameters.quickFind={buildTime:"<%= buildTime %>",
            minSearchChars:${quickFindConfig['minSearchChars']},
            defaultDisplayedResults:${quickFindConfig['defaultDisplayedResults']},
            augmentedFindDelayInTypingToLaunchSearch:${quickFindConfig['augmentedFindDelayInTypingToLaunchSearch']},
            jcrFindDelayInTypingToLaunchSearch:${quickFindConfig['jcrFindDelayInTypingToLaunchSearch']},
            uiFeaturesEnabled:${quickFindConfig['uiFeaturesEnabled']},
            uiFeaturesMaxResults:${quickFindConfig['uiFeaturesMaxResults']},
            jcrMediaEnabled:${quickFindConfig['jcrMediaEnabled']},
            jcrMediaMaxResults:${quickFindConfig['jcrMediaMaxResults']},
            jcrPagesEnabled:${quickFindConfig['jcrPagesEnabled']},
            jcrPagesMaxResults:${quickFindConfig['jcrPagesMaxResults']},
            jcrMainResourcesEnabled:${quickFindConfig['jcrMainResourcesEnabled']},
            jcrMainResourcesMaxResults:${quickFindConfig['jcrMainResourcesMaxResults']},
            urlReverseLookupEnabled:${quickFindConfig['urlReverseLookupEnabled']}
        }
        console.debug("%c quick-find config is added to contextJsParameters", "color: #3c8cba");
    </c:when>
    <c:otherwise>
        <utility:logger level="warn" value="quick-find configuration is not available"/>
        console.warn("quick-find configuration is not available");
    </c:otherwise>
</c:choose>
