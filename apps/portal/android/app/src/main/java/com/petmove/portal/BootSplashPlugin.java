package com.petmove.portal;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 부트 스플래시(콜드 스타트 풀화면 이미지)를 웹에서 내리기 위한 로컬 플러그인.
 *
 * 왜 필요한가: Android 12+ 시스템 스플래시는 아이콘+단색만 지원하고,
 * @capacitor/splash-screen 은 12+ 에서 시스템 스플래시만 유지할 뿐 drawable 풀화면
 * 이미지를 런치에 안 띄운다(androidx 가 일반 테마에서도 예외 없이 동작해 레거시 폴백도
 * 안 탐 — 2026-07-15 실기기 확인). 그래서 MainActivity 가 직접 ImageView 오버레이를
 * 띄우고, 웹 셸(NativeSplash)이 첫 페인트 후 이 플러그인의 hide() 로 내린다.
 */
@CapacitorPlugin(name = "BootSplash")
public class BootSplashPlugin extends Plugin {

    @PluginMethod
    public void hide(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            activity.runOnUiThread(((MainActivity) activity)::hideBootSplash);
        }
        call.resolve();
    }
}
