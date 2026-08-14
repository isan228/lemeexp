import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "app_router.dart";
import "config/theme.dart";
import "providers/auth_provider.dart";

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final auth = AuthProvider();
  await auth.bootstrap();
  runApp(LemexplainApp(auth: auth));
}

class LemexplainApp extends StatelessWidget {
  LemexplainApp({super.key, required this.auth}) : router = createRouter(auth);

  final AuthProvider auth;
  final GoRouter router;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: auth,
      child: MaterialApp.router(
        title: "Let me explain",
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        routerConfig: router,
      ),
    );
  }
}
