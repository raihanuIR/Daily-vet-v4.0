/* DailyVet — Responsive Viewport & App Height Manager
   Provides --app-h for full-height views while allowing pure responsive
   Tailwind CSS to adapt to mobile, tablet, and desktop screens naturally. */
(function () {
    var root = document.documentElement;

    function apply() {
        var vh = window.innerHeight;
        root.style.setProperty('--app-h', vh + 'px');
        root.classList.remove('is-compact');
        document.body.style.overflowX = 'hidden';
    }

    apply();
    document.addEventListener('DOMContentLoaded', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('pageshow', apply);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', apply);
})();