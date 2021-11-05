# Overview

For an initial introduction on how to integrate the true[X] SDK into a web application, please refer to the [Getting Started](./GETTING_STARTED.md) guide.

This project contains sample source code that demonstrates an example integration of true[X]'s CTV Web ad renderer with the Google Ad Manager, using the IMA SDK. This further exemplifies the needed logic to manage true[X] opt-in flows (choice cards) as fully stitched into the video stream, when true[X] ads are encountered in the ad feed. 

Google IMA Documentation can be found [here|https://developers.google.com/interactive-media-ads].

For a more detailed true[X] integration guide, please refer to the [CTV Web Integration documentation](https://github.com/socialvibe/truex-ctv-web-integration) on github.com.

# Implementation Details

In this project we exercise the integration with the Google Ad server via the [HTML5 Google IMA SDK](https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side) for client-side ad insertion.

The main video is defined by the [video-streams.json](./src/data/video-streams.json) file. The ads are canned, and are defined in the [sample-ad-playlist.xml](./src/data/sample-ad-playlist.xml) file. In this sample application, a preroll and a midroll ad breaks are defined.

Two versions are the app are demonstrated in this code base, a "simple" integration to the pure IMA SDK, integrating to our own HTML5 video element, with app specific video controls. This app's entry point is defined in the [simple.js](./src/simple/simple.js) file, with the core IMA SDK integration implemented in [simple-video-controller.js](./src/simple/simple-video-controller.js). The simple app version is hosted [here with the index.html entry point](https://ctv.truex.com/web/ref-app-IMA-CSAI/master/index.html).

A higher level integration to the IMA SDK using the popular [videojs package](https://www.npmjs.com/package/videojs) is demonstrated with the [integrated.js](./src/integrated/integrated.js) app file, with the videojs/IMA integration implemented in [videojs-controller.js](./src/integrated/videojs-controller.js). The integrated app version is hosted [here with the integrated.html entry point](https://ctv.truex.com/web/ref-app-IMA-CSAI/master/integrated.html).

For both apps, the same [index.html](./src/index.html) main page is used.

In order to start playing a video, video stream objects are given to the `startVideo` method of the app's video controller instance. In the `onAdEvent` method, various ad events are fielded, the key one being `AdEvent.Type.STARTED`. There the app determines if a true[X] ad is present vs a regular video ad. If so, the an `InteractiveAd` instance is created to display it. If not, IMA adsManager instance continues to play the non-true[X] ad video. 

To display a true[X] ad, a new `InteractiveAd` instance (from [interactive-ad.js](./src/components/interactive-ad.js)) is created with vast config url extracted from the ad instance's tag parameters. Upon calling the interactive ad's `start` method, a `TruexAdRenderer` instance (i.e. `tar`) is created to render and overlay the choice card and ultimately the engagement ad over top of the playback page. If the user skips the interaction, the ad fallback video is played instead, or else the main video is cancelled entirely if the user backs out of the ad completely.

The `tar` integration flow is described in the `start` method, with the key responsibilities for the host application developer being showing the the `handleAdEvent` method, which fields ad events to track the state of ad changes, until the ad is ultimately completed or cancelled, tracking in particular whether the viewer interacted enough with the ad to earn a free pod skip to continue with the main video, or else fallback to playing the ad videos instead.

# Build/Develop/Deploy

To begin development, run the standard `npm install` to download the project's dependencies.

To deploy in general, one makes a deployable version in the `./dist` folder via `npm run build` and then hosts those contents somewhere appropriate. On then ensures the various platform installer configurations refer to that url. Again, [simple](https://ctv.truex.com/web/ref-app-IMA-CSAI/master/index.html) and [integrated](https://ctv.truex.com/web/ref-app-IMA-CSAI/master/integrated.html) hosted copies of the reference app are available for viewing in a browser, to review and debug the reference app generically.

To run a local build, run the `npm start` command to run a local webpack instance. You can use `http://localhost:8080` or `http://0.0.0.0:8080` to review and debug in Chrome.

For platform deployments using your local build, you will need to refer to your PC's IP address as the launcher url, e.g. `http://1912.168.1.72:8080`, using instead your real IP on the local Wifi network, of course. 

## Platform Deployments

The instructions for deploy to specific device platforms are available in the platform specific READMEs under the `./platforms` directory:
* [Fire TV / Android TV](platforms/AndroidFireTV/README.md)
* [Vizio](./platforms/Vizio/README.md)
* [LG](./platforms/LG/README.md)
* [Tizen](./platforms/Tizen/README.md)
* [PS4](./platforms/PS4/README.md)
* [PS5](./platforms/PS5/README.md)
* [XboxOne](./platforms/XboxOne/README.md)

## History.back blocking

If you choose to field and process history.back() actions, custom `popstate` event handling will be required to allow your app to cooperate with true[X]'s own back action blocking needed to control a user's prematurely exiting from an ad.

In particular, on the Fire TV, the back action key event cannot be reliably overridden, and one must process `history.back()` actions instead via the `popstate` event handler.

The key problem comes about since the popstate event cannot be blocked, so app developers must instead follow a practice whereby they only field back actions that are applicable only to their own application code. Please refer to this code in `main.js` for an such approach, noting in particular the `onBackAction`, `pushBackActionBlock` and `pushBackActionStub` methods. In particular, note how the host app recognized its own history state changes vs true[X]'s.
 ```
 window.addEventListener("popstate", onBackAction);

 function onBackAction(event) {
     // Since the true[X] ad renderer also needs to field this event, we need to ignore when the user
     // backs out of the ad overlay.
     //
     // We do this by only recognizing a back action to this app's specific state.
     const state = event && event.state;
     const isForThisApp = state && state.app == config.name && state.isBlock;
     if (!isForThisApp) return; // let the back action proceed, most likely from ad overlay processing.

     pushBackActionStub(); // ensure the next back action for this app is blocked.

     returnToParentPage();
 }
 ```

# Usage

* Select "4", Menu on the remote, or click left stick the controller to show the in app console/debug log. Back action dismisses it again.
* To aid in QA/Review, select "2" on the remote, or click the right stick on the controller to skip to the end of a playing ad fallback video.
