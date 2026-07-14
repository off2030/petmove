package com.petmove.portal;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** 부트 스플래시 백스톱(ms) — 웹이 hide 신호를 못 보내도 이 시간 뒤엔 내린다.
     *  (구 @capacitor/splash-screen launchShowDuration=3000 과 동일한 상한.) */
    private static final long BOOT_SPLASH_MAX_MS = 3000;

    private View bootSplash;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 커스텀 플러그인 등록은 super.onCreate(브릿지 초기화) 전에 해야 한다.
        registerPlugin(BootSplashPlugin.class);
        super.onCreate(savedInstanceState);

        // 부트 스플래시 — 콜드 스타트에서 시안 풀화면(하늘 그라디언트+"펫무브"+구름·P)을 띄운다.
        // Android 12+ 시스템 스플래시는 아이콘+단색만 지원하고 @capacitor/splash-screen 도
        // 12+ 런치에선 시스템 스플래시만 유지하므로(풀화면 이미지 불가, 2026-07-15 실기기 확인),
        // 액티비티가 직접 ImageView 오버레이를 얹는다. 안드로이드 쪽 플러그인 런치 스플래시는
        // capacitor.config.json(android 사본)의 launchShowDuration=0 으로 꺼서(scripts/
        // patch-android-splash-config.mjs) 시스템 아이콘 화면이 첫 프레임에 바로 내려가게 한다.
        // 웹 셸(NativeSplash)이 첫 페인트 후 BootSplash.hide() 로 내리고, 못 내리면 백스톱.
        // savedInstanceState != null(재생성)일 땐 콜드 스타트가 아니므로 띄우지 않는다.
        if (savedInstanceState == null) {
            showBootSplash();
        }

        // 하단 내비게이션 바를 밝은 앱 배경에 맞춰 어두운 버튼 아이콘으로.
        // 안드로이드 15+(API 35+)는 테마의 windowLightNavigationBar 를 무시하므로
        // (상태바와 동일한 문제) 실행 중 WindowInsetsController 로 강제 지정한다.
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightNavigationBars(true);

        // 콜드스타트 푸시 탭 딥링크 보완:
        // @capacitor-firebase/messaging 은 알림 탭을 onNewIntent 로만 처리한다. 앱이 완전히
        // 종료된 상태에서 알림을 탭하면 그 인텐트는 onCreate 의 launch 인텐트로 들어오고
        // (onNewIntent 가 아님) → 플러그인이 탭을 못 받아 해당 동물 일정으로 딥링크되지 않는다.
        // launch 인텐트에 FCM 키가 있으면 onNewIntent 로 재전달해 플러그인이
        // notificationActionPerformed(retainUntilConsumed) 를 발화하게 한다.
        // (웹 NotificationTapListener 가 그 이벤트를 받아 /cases/<id>/journey 로 이동.)
        Intent launchIntent = getIntent();
        if (launchIntent != null && launchIntent.hasExtra("google.message_id")) {
            onNewIntent(launchIntent);
        }
    }

    private void showBootSplash() {
        ImageView image = new ImageView(this);
        image.setImageResource(R.drawable.splash);
        // 시안과 동일하게 화면을 꽉 채움(2732 정사각 원본을 세로 화면에 CENTER_CROP).
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        // 이미지 로드 전/여백 대비 배경 = 스플래시 하단 하늘색.
        image.setBackgroundColor(0xFF0BAEFF);
        image.setClickable(true); // 스플래시 아래 웹뷰로 탭이 새지 않게.
        bootSplash = image;
        addContentView(
                image,
                new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        image.postDelayed(this::hideBootSplash, BOOT_SPLASH_MAX_MS);
    }

    /** 부트 스플래시를 페이드아웃으로 내린다. 여러 번 불려도 안전. UI 스레드에서 호출할 것. */
    public void hideBootSplash() {
        View view = bootSplash;
        if (view == null) {
            return;
        }
        bootSplash = null;
        view.animate()
                .alpha(0f)
                .setDuration(200)
                .withEndAction(() -> {
                    ViewGroup parent = (ViewGroup) view.getParent();
                    if (parent != null) {
                        parent.removeView(view);
                    }
                })
                .start();
    }
}
