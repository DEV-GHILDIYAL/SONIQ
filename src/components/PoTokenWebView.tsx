import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { attachPoTokenHost, handlePoTokenMessage } from '@/lib/poToken';
import { POTOKEN_HTML } from '@/lib/poTokenHtml';

/**
 * Invisible WebView that runs YouTube's BotGuard to mint PO tokens (see src/lib/poToken.ts).
 * Mounted once in the root layout; renders nothing visible.
 */
export function PoTokenWebView() {
  // react-native-webview types default P to `undefined`, which makes props `never`
  // under strict TS + React 19 types. Passing `object` restores the normal props.
  const ref = useRef<WebView<object>>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(
    () =>
      attachPoTokenHost({
        run: (js) => ref.current?.injectJavaScript(js),
        reload: () => setGeneration((g) => g + 1),
      }),
    [],
  );

  return (
    <View
      pointerEvents="none"
      style={styles.hidden}
      importantForAccessibility="no-hide-descendants"
    >
      <WebView<object>
        key={generation}
        ref={ref}
        source={{ html: POTOKEN_HTML, baseUrl: 'https://www.youtube.com' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => handlePoTokenMessage(e.nativeEvent.data)}
        onError={(e) =>
          handlePoTokenMessage(
            JSON.stringify({
              type: 'init-error',
              stage: 'webview',
              message: e.nativeEvent.description,
            }),
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
});
