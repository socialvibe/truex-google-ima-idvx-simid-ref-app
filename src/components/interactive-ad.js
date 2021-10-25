import uuid from 'uuid';
import { TruexAdRenderer } from '@truex/ctv-ad-renderer';

// Use a random UUID for the "opt out of tracking" advertising id that is stable for all ads in an app session.
const optOutAdvertisingId = uuid.v4();

// Exercises the True[X] Ad Renderer for interactive ads.
export class InteractiveAd {
    constructor(vastConfigUrl, videoController) {
        let adFreePod = false;
        let adOverlay;
        let tar;

        const platform = videoController.platform;

        this.start = async () => {
            videoController.showLoadingSpinner(true);

            const nativeAdvertisingId = await getNativePlatformAdvertisingId();

            try {
                videoController.pause();

                // Ensure the entire player is no longer visible.
                videoController.videoOwner.classList.remove('show');

                const options = {
                    userAdvertisingId: nativeAdvertisingId, // i.e. override from native side query if present
                    fallbackAdvertisingId: optOutAdvertisingId, // random fallback to use if no user ad id is available
                    supportsUserCancelStream: true // i.e. user backing out of an ad will cancel the entire video
                };

                tar = new TruexAdRenderer(vastConfigUrl, options);
                tar.subscribe(handleAdEvent);

                return tar.init()
                    .then(vastConfig => {
                        return tar.start(vastConfig);
                    })
                    .then(newAdOverlay => {
                        adOverlay = newAdOverlay;
                    })
                    .catch(handleAdError);
            } catch (err) {
                handleAdError(err);
            }
        };

        function handleAdEvent(event) {
            const adEvents = tar.adEvents;
            switch (event.type) {
                case adEvents.adError:
                    handleAdError(event.errorMessage);
                    break;

                case adEvents.adStarted:
                    // Choice card loaded and displayed.
                    videoController.showLoadingSpinner(false);
                    break;

                case adEvents.optIn:
                    // User started the engagement experience
                    break;

                case adEvents.optOut:
                    // User cancelled out of the choice card, either explicitly, or implicitly via a timeout.
                    break;

                case adEvents.adFreePod:
                    adFreePod = true; // the user did sufficient interaction for an ad credit
                    break;

                case adEvents.userCancel:
                    // User backed out of the ad, now showing the choice card again.
                    break;

                case adEvents.userCancelStream:
                    // User backed out of the choice card, which means backing out of the entire video.
                    closeAdOverlay();
                    videoController.closeVideoAction();
                    break;

                case adEvents.noAdsAvailable:
                case adEvents.adCompleted:
                    // Ad is not available, or has completed. Depending on the adFreePod flag, either the main
                    // video or the ad fallback videos are resumed.
                    closeAdOverlay();
                    resumePlayback();
                    break;
            }
        }

        async function getNativePlatformAdvertisingId() {
            if (window.webApp && window.fireTvApp) {
                return new Promise(function(resolve, reject) {
                    window.webApp.onAdvertisingIdReady = function(advertisingId) {
                        // consume the callback
                        window.webApp.onAdvertisingIdReady = null;
                        resolve(advertisingId);
                    }

                    window.fireTvApp.getAdvertisingId && window.fireTvApp.getAdvertisingId();
                });
            }

            var advertisingId = undefined;

            if (platform.isTizen) {
                const webapis = window.webapis;
                const adinfo = webapis && webapis.adinfo;
                if (adinfo) {
                    try {
                        if (adinfo.isLATEnabled()) {
                            console.log('tizen ad id ignored due to Limited Ad Tracking');
                        } else {
                            advertisingId = adinfo.getTIFA();
                            console.log('tizen ad id: ' + advertisingId);
                        }
                    } catch (err) {
                        console.warn('tizen ad id error: ' + platform.describeError(err));
                    }
                } else {
                    console.warn('tizen ad id: webapis not present');
                }
            }

            return Promise.resolve(advertisingId);
        }

        function handleAdError(errOrMsg) {
            console.error('ad error: ' + errOrMsg);
            if (tar) {
                // Ensure the ad is no longer blocking back or key events, etc.
                tar.stop();
            }
            closeAdOverlay();
            resumePlayback();
        }

        function closeAdOverlay() {
            // The client-side IMA SDK can steal the keyboard focus, esp if the user is clicking on ads.
            // Ensure the app focus is again in place.
            window.focus();

            videoController.showLoadingSpinner(false);
            if (adOverlay) {
                if (adOverlay.parentNode) adOverlay.parentNode.removeChild(adOverlay);
                adOverlay = null;
            }
            videoController.videoOwner.classList.add('show');
        }

        function resumePlayback() {
            if (adFreePod) {
                // The user has the ad credit, skip over the ad video.
                videoController.skipAdBreak();
            } else {
                videoController.resumeAdPlayback();
            }
        }
    }
}