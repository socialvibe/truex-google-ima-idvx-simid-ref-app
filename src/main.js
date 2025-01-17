
import config from './config';
import { DebugLog } from 'truex-shared/components/debug-log';
import { inputActions } from 'truex-shared/focus_manager/txm_input_actions';
import { Focusable } from 'truex-shared/focus_manager/txm_focusable';
import { TXMFocusManager } from 'truex-shared/focus_manager/txm_focus_manager';
import { LoadingSpinner } from "./components/loading-spinner";
import { v4 as uuid } from 'uuid';
import videoStreams from "./data/video-streams.json";
import homeBackgroundPath from "./assets/home-page-background.png";

/**
 * Main app constructor for demonstrating the of the IMA SDK for client side ad insertion.
 * @param {Function} videoControllerClass constructor function for the video controller class to use.
 */
export function main(videoControllerClass) {
    const focusManager = new TXMFocusManager();
    const platform = focusManager.platform;

    // Expose to allow input injections from FireTV native code.
    window.focusManager = focusManager;
    window.webApp = {};

    let currentPage = 'home-page';
    let lastPage;

    const debugLog = new DebugLog();
    debugLog.captureConsoleLog();

    const spinner = new LoadingSpinner();

    const currentVideoStream = videoStreams[0];

    // Randomize the stream id and current user id for this session, to work around ad usage capping.
    const currentUserId = uuid();
    currentVideoStream.id = uuid();

    const videoController = new videoControllerClass("#playback-page", "#playback-page .video-control-bar", platform);
    videoController.currentUserId = currentUserId;
    videoController.loadingSpinner = spinner;
    videoController.closeVideoAction = returnToParentPage;

    function hidePage() {
        // Ensure no videos are playing
        videoController.stopVideo();

        // Hide whatever page is currently shown.
        document.querySelectorAll('.app-content .page').forEach(page => {
            page.classList.remove('show');
        });

        // Ensure no outstanding loading spinner.
        spinner.hide();

        focusManager.setContentFocusables([]);
    }

    function showPage(pageId) {
        lastPage = currentPage;
        currentPage = pageId;
        renderCurrentPage();
    }

    function renderCurrentPage() {
        hidePage();

        const pageSelector = '#' + currentPage;
        enableStyle(pageSelector, 'show', true);

        if (currentPage == "home-page") {
            renderHomePage();

        } else if (currentPage == "playback-page") {
            renderPlaybackPage();

        } else if (currentPage == "test-page") {
            spinner.show();
        }
    }

    let resizeTimer;

    function onAppResized() {
        // Just push out the timer some more until things settle.
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            scaleAppSize();
            renderCurrentPage();
        }, 100);
    }

    function scaleAppSize() {
        // Ensure our app uses a consistent 1920x1080 design size that fits within the actual screen size.
        const designW = 1920;
        const designH = 1080;

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        const widthScaleFactor = screenW / designW;
        const heightScaleFactor = screenH / designH;
        const scaleFactor = Math.min(widthScaleFactor, heightScaleFactor);
        const scaledH = designH * scaleFactor;
        const scaledW = designW * scaleFactor;

        // Center in the actual screen.
        const top = Math.max(screenH - scaledH, 0) / 2;
        const left = Math.max(screenW - scaledW, 0) / 2;

        function px(value) { return '' + value + 'px' }

        const appContent = document.querySelector('.app-content');

        appContent.style.position = 'absolute';
        appContent.style.width = px(designW);
        appContent.style.height = px(designH);
        appContent.style.top = px(top);
        appContent.style.left = px(left);

        const transform = 'scale(' + scaleFactor + ')';
        const origin = '0% 0% 0';

        appContent.style.transform = transform;
        appContent.style.transformOrigin = origin;

        appContent.style.webkitTransform = transform;
        appContent.style.webkitTransformOrigin = origin;

        console.log(`screen size: ${screenW} ${screenH} scale: ${scaleFactor}`)
    }

    function enableStyle(elementOrSelector, cssStyle, enabled) {
        let element = (typeof elementOrSelector == 'string')
            ? document.querySelector(elementOrSelector) : elementOrSelector;
        if (enabled) {
            element.classList.add(cssStyle);
        } else {
            element.classList.remove(cssStyle);
        }
    }

    function renderHomePage() {
        const homePage = document.querySelector('#home-page');

        const titleDiv = homePage.querySelector('.title');
        titleDiv.innerText = currentVideoStream.title;

        const descriptionDiv = homePage.querySelector('.description');
        descriptionDiv.innerText = currentVideoStream.description;

        const tray = homePage.querySelector('.tray');
        const selectedTile = tray.querySelector('.selected-tile');
        selectedTile.src = currentVideoStream.cover;

        setFocus('.play-content-button', () => {
            videoController.currVideoTime = 0; // restart the video
            showPage('playback-page')
        });
    }

    function renderPlaybackPage() {
        videoController.startVideoLater(currentVideoStream);

        const pageDiv = document.getElementById('playback-page');

        // The entire page is the focus.
        setFocus(pageDiv, null, action => {
            if (action == inputActions.select || action == inputActions.playPause) {
                videoController.togglePlayPause();
                return true; // handled
            }

            if (action == inputActions.fastForward || action == inputActions.moveRight
                || action == inputActions.rightShoulder1 || action == inputActions.rightShoulder2) {
                videoController.stepForward();
                return true; // handled
            }

            if (action == inputActions.rewind || action == inputActions.moveLeft
                || action == inputActions.leftShoulder1 || action == inputActions.leftShoulder2) {
                videoController.stepBackward();
                return true; // handled
            }

            if (action == inputActions.num2 || action == inputActions.rightStick) {
                // QA helper to allow ads to be skipped.
                videoController.skipAdBreak();
                return true; // handled
            }
        });
    }

    function newFocusable(elementRef, selectAction, inputAction) {
        return new Focusable(elementRef, selectAction, inputAction, focusManager);
    }

    function setFocus(elementRef, selectAction, inputAction) {
        focusManager.setContentFocusables([newFocusable(elementRef, selectAction, inputAction)]);
    }

    function onBackAction(event) {
        // Since the true[X] ad renderer also needs to field this event, we need to ignore
        // when the user backs out of the ad overlay.
        // We do this by only recognizing a back action to this app's specific state.
        const state = event && event.state;
        const isForThisApp = state && state.app == config.name && state.isBlock;
        if (!isForThisApp) {
            // let the back action proceed, most likely from ad overlay processing.
            return;
        }

        // ensure the next back action for this app is blocked.
        pushBackActionStub();

        returnToParentPage();
    }

    function pushBackActionBlock() {
        history.pushState({app: config.name, isBlock: true}, null, null);
        pushBackActionStub(); // push a history state that can be consumed for this app's back action.
    }

    function pushBackActionStub() {
        history.pushState({app: config.name, isStub: true}, null, null);
    }

    function returnToParentPage() {
        let returnToPage = 'home-page';
        showPage(returnToPage);
    }

    function initializeApplication() {
        try {
            const baseOnInputAction = focusManager.onInputAction;

            focusManager.onInputAction = (action) => {
                if (action == inputActions.num4 || action == inputActions.leftStick || action == inputActions.menu) {
                    // Show debug log with either "4" on the remote, or clicking the left stick on the game controller.
                    // Or the menu key, e.g. for FireTV
                    debugLog.show();
                    return true; // handled
                }

                const handled = baseOnInputAction(action);
                if (handled) return true;

                if (action == inputActions.exit) {
                    platform.exitApp();
                    return true;
                }

                if (action == inputActions.back) {
                    returnToParentPage();
                    return true; // handled
                }

                return false;
            };

            scaleAppSize();
            renderCurrentPage();

            // Handle resizes for when testing in chrome.
            window.addEventListener("resize", onAppResized);

            window.addEventListener("keydown", focusManager.onKeyDown);

            // We need to field the back action popstate change on platforms like the FireTV and LG,
            // where we cannot reliably consume back action key events.
            // for FireTV see: https://developer.amazon.com/docs/fire-tv/web-app-faq.html
            // for LG see https://webostv.developer.lge.com/develop/app-developer-guide/back-button/
            pushBackActionBlock(); // push a back action block
            window.addEventListener("popstate", onBackAction);

            // Hide the splash page until the home page is ready.
            // NOTE: we skip the local wait if we have a native splash screen in the host app.
            const hasNativeSplashScreen = platform.isFireTV || platform.isAndroidTV
                || platform.isLG || platform.isConsole;
            const splashTimeout = hasNativeSplashScreen ? 0 : 2000;
            setTimeout(hideSplashScreenWhenLoaded, splashTimeout);
        } catch (err) {
            console.error('initialization error: ' + platform.describeErrorWithStack(err));
            hideSplashScreen();
            setTimeout(() => debugLog.show(), 0);
        }
    }

    function hideSplashScreenWhenLoaded() {
        const homeBackground = new Image();
        homeBackground.addEventListener('load', hideSplashScreen);
        homeBackground.addEventListener('error', hideSplashScreen);
        homeBackground.src = homeBackgroundPath;
    }

    function hideSplashScreen() {
        const splash = document.querySelector('.splash-page');
        if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
        const hostApp = window.hostApp;
        if (hostApp && hostApp.hideSplashScreen) {
            hostApp.hideSplashScreen();
        }
    }

    initializeApplication();
};
