/**
 * App footer component – injects the shared footer into any element with data-app-footer.
 * Include this script on pages that need the footer (e.g. index.html, group-detail.html).
 */
(function() {
    var FOOTER_HTML = '<footer class="app-footer">' +
        '<div class="container app-footer-inner">' +
        '<a href="admin.html" class="app-footer-brand" title="Admin" aria-label="Admin">' +
        '<img src="images/logo.png" alt="" />' +
        '<span class="app-footer-name">SplitXpense</span>' +
        '</a>' +
        '<div class="app-footer-meta">' +
        '<span class="app-footer-copy">© 2025 · Built with ❤️ by Shilpha</span>' +
        '</div>' +
        '</div>' +
        '</footer>';

    function injectFooter() {
        var placeholder = document.querySelector('[data-app-footer]');
        if (!placeholder) return;
        var wrap = document.createElement('div');
        wrap.innerHTML = FOOTER_HTML;
        var footer = wrap.firstElementChild;
        if (footer && placeholder.parentNode) {
            placeholder.parentNode.replaceChild(footer, placeholder);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFooter);
    } else {
        injectFooter();
    }
})();
