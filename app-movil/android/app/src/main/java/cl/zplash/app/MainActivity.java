package cl.zplash.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio (no viene de npm): hay que registrarlo antes de super.
        registerPlugin(GeocercaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
