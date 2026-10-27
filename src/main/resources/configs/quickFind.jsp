<%@ page language="java" contentType="text/javascript" import="java.util.Date" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="fn" uri="http://java.sun.com/jsp/jstl/functions" %>
<%@ taglib prefix="utility" uri="http://www.jahia.org/tags/utilityLib" %>
<%@ taglib prefix="functions" uri="http://www.jahia.org/tags/functions" %>
<% String buildTime = new Date().toString(); %>
<c:set var="quickFindConfig" value="${functions:getConfigValues('org.jahia.pm.modules.quickfind')}"/>
<%-- A key that an older .cfg lacks prints undefined, so configUtils.ts applies its default. A module upgrade keeps the existing .cfg. --%>
<%-- A value is printed unquoted, so a value that is not true or false for a *Enabled key, or not a non-negative integer for another key, prints undefined too. --%>
<c:choose>
    <c:when test="${! empty quickFindConfig}">
        contextJsParameters.quickFind={buildTime:"<%= buildTime %>"
        <c:forEach var="key" items="minSearchChars,defaultDisplayedResults,augmentedFindDelayInTypingToLaunchSearch,jcrFindDelayInTypingToLaunchSearch,sitesEnabled,sitesMaxResults,uiFeaturesEnabled,uiFeaturesMaxResults,jcrMediaEnabled,jcrMediaMaxResults,jcrPagesEnabled,jcrPagesMaxResults,jcrMainResourcesEnabled,jcrMainResourcesMaxResults,urlReverseLookupEnabled">
            <c:set var="value" value="${fn:trim(quickFindConfig[key])}"/>
            <c:set var="isBooleanKey" value="${fn:endsWith(key, 'Enabled')}"/>
            <c:choose>
                <c:when test="${isBooleanKey ? value.matches('true|false') : value.matches('[0-9]+')}">
                    <%-- JavaScript reads 010 as the octal 8. --%>
                    ,${key}:${isBooleanKey ? value : value.replaceFirst('^0+(?=[0-9])', '')}
                </c:when>
                <c:otherwise>
                    <c:if test="${! empty value}">
                        <utility:logger level="warn" value="quick-find ignores ${key}=${value} in the configuration org.jahia.pm.modules.quickfind and uses its default: the value must be ${isBooleanKey ? 'true or false' : 'a non-negative integer'}"/>
                    </c:if>
                    ,${key}:undefined
                </c:otherwise>
            </c:choose>
        </c:forEach>
        }
        console.debug("%c quick-find config is added to contextJsParameters", "color: #3c8cba");
    </c:when>
    <c:otherwise>
        <utility:logger level="warn" value="quick-find configuration is not available"/>
        console.warn("quick-find configuration is not available");
    </c:otherwise>
</c:choose>
