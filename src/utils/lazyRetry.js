import { lazy } from 'react';

/**
 * A wrapper for React.lazy that adds refresh logic when a dynamic import fails.
 * This handles cases where a new version of the app is deployed and old 
 * hashed JS files are no longer available on the server.
 * 
 * @param {Function} componentImport - A function that returns a promise (e.g., () => import('./MyComponent'))
 * @returns {React.Component} A lazy-loaded component with retry logic
 */
export const lazyRetry = (componentImport) => {
    return lazy(async () => {
        const pageHasAlreadyBeenForceRefreshed = JSON.parse(
            window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
        );

        try {
            const component = await componentImport();
            window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
            return component;
        } catch (error) {
            console.error('Lazy load error:', error);
            
            if (!pageHasAlreadyBeenForceRefreshed) {
                // If the import fails, it might be due to a new deployment.
                // Force a refresh to fetch the latest index.html and JS assets.
                window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
                return window.location.reload();
            }

            // If we already refreshed and it still fails, bubble up the error
            throw error;
        }
    });
};
