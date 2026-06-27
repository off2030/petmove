package com.petmove.portal;

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
    }
}
