package org.jahia.pm.modules.quickfind.graphql;

import org.jahia.modules.graphql.provider.dxm.DXGraphQLExtensionsProvider;
import org.osgi.service.component.annotations.Component;

import java.util.Arrays;
import java.util.Collection;

@Component(service = DXGraphQLExtensionsProvider.class, immediate = true)
public class QuickFindGraphQLExtensionProvider implements DXGraphQLExtensionsProvider {

    @Override
    public Collection<Class<?>> getExtensions() {
        return Arrays.asList(QuickFindQueryExtensions.class);
    }
}
