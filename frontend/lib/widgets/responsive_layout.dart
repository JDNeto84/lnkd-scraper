import 'package:flutter/material.dart';

class ResponsiveLayout extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  final bool usePadding;

  const ResponsiveLayout({
    super.key,
    required this.child,
    this.maxWidth = 1200,
    this.usePadding = true,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(
          padding: usePadding
              ? const EdgeInsets.symmetric(horizontal: 16.0)
              : EdgeInsets.zero,
          child: child,
        ),
      ),
    );
  }
}
