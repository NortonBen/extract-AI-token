import 'package:flutter_test/flutter_test.dart';

import 'package:app/main.dart';

void main() {
  test('BackendStatus stores state and message', () {
    const status = BackendStatus(
      state: BackendState.running,
      message: '{"ok":true}',
    );

    expect(status.state, BackendState.running);
    expect(status.message, '{"ok":true}');
  });
}
