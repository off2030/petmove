package com.petmove.portal;

import android.content.Intent;
import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 하단 내비게이션 바를 stone(밝은) 배경에 맞춰 어두운 버튼 아이콘으로.
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
}
