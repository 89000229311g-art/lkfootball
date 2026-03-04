import 'package:flutter/material.dart';
import '../../l10n/app_localizations.dart';

class TrainingPlanScreen extends StatelessWidget {
  const TrainingPlanScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        context.l10n.translate('training_plan'),
        style: const TextStyle(color: Colors.white),
      ),
    );
  }
}
