import 'package:flutter/material.dart';

import '../scout_avatar.dart';
import '../theme.dart';
import '../ux.dart';

/// The shopper's chosen face, or their initials until they choose one.
///
/// The picture is a static file on the same origin as the API, so it is
/// edge-cached and costs nothing to serve. Until it arrives, and if it never
/// does, the initials tile stands in — an avatar must never be a blank hole in
/// the app bar because a network was slow.
class ScoutAvatarView extends StatelessWidget {
  const ScoutAvatarView({
    super.key,
    required this.initials,
    this.size = 44,
    this.borderWidth = 2,
    this.showShadow = true,
  });

  final String initials;
  final double size;
  final double borderWidth;
  final bool showShadow;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ScoutAvatarStore.instance,
      builder: (context, _) {
        final avatar = ScoutAvatarStore.instance.current;
        return Container(
          // Anchors the widget test that pins the clipped, keyed corner.
          key: const ValueKey('scout-avatar-card'),
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: TS.red,
            borderRadius: BorderRadius.circular(TS.controlRadius),
            border: Border.all(color: TS.ink, width: borderWidth),
            boxShadow: showShadow
                ? const [BoxShadow(color: TS.ink, offset: Offset(2, 2))]
                : null,
          ),
          clipBehavior: Clip.antiAlias,
          child: avatar == null
              ? _Initials(initials: initials, size: size)
              : Image.network(
                  avatar.imageUrl,
                  key: ValueKey(avatar.pfpId),
                  fit: BoxFit.cover,
                  // Ask for roughly what is drawn rather than the full 320,
                  // so a bar full of avatars is not decoding poster-sized
                  // bitmaps.
                  cacheWidth: (size * 3).round(),
                  errorBuilder: (_, __, ___) =>
                      _Initials(initials: initials, size: size),
                  frameBuilder: (context, child, frame, wasSync) {
                    if (wasSync) return child;
                    return AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      child: frame == null
                          ? _Initials(initials: initials, size: size)
                          : child,
                    );
                  },
                ),
        );
      },
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.initials, required this.size});

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: TS.red,
        child: Center(
          child: Text(
            initials,
            style: TextStyle(
              color: TS.onDark,
              fontWeight: FontWeight.w900,
              fontSize: size * 0.38,
              height: 1,
            ),
          ),
        ),
      );
}

/// Lets the shopper pick a face.
Future<void> showScoutAvatarPicker(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _AvatarPickerSheet(),
  );
}

class _AvatarPickerSheet extends StatefulWidget {
  const _AvatarPickerSheet();

  @override
  State<_AvatarPickerSheet> createState() => _AvatarPickerSheetState();
}

class _AvatarPickerSheetState extends State<_AvatarPickerSheet> {
  late String? _draft = ScoutAvatarStore.instance.current?.pfpId;

  void _choose(String id) {
    if (_draft == id) return;
    uxTap();
    setState(() => _draft = id);
  }

  Future<void> _save() async {
    final id = _draft;
    if (id == null) return;
    uxTap();
    await ScoutAvatarStore.instance.save(ScoutAvatar(pfpId: id));
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(10),
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.8,
        ),
        decoration: TS.slab(context, color: TS.surfaceOf(context)),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Choose your picture',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded, size: 20),
                ),
              ],
            ),
            Text(
              'Pick a face. Nothing is uploaded and no photo of you is ever '
              'stored.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 14),
            Flexible(
              child: GridView.builder(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                gridDelegate:
                    const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                ),
                itemCount: ScoutAvatarCatalog.options.length,
                itemBuilder: (context, index) {
                  final option = ScoutAvatarCatalog.options[index];
                  return _AvatarTile(
                    option: option,
                    selected: option.id == _draft,
                    onTap: () => _choose(option.id),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('save-avatar'),
                onPressed: _draft == null ? null : _save,
                child: const Text('Use this picture'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarTile extends StatelessWidget {
  const _AvatarTile({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final ScoutAvatarOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: option.label,
      child: Tooltip(
        message: option.label,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              color: selected ? TS.yellow : TS.surfaceSoftOf(context),
              borderRadius: BorderRadius.circular(TS.controlRadius),
              border: Border.all(
                color: TS.lineOf(context),
                width: selected ? 3 : 1.5,
              ),
              boxShadow: selected
                  ? const [BoxShadow(color: TS.ink, offset: Offset(3, 3))]
                  : null,
            ),
            clipBehavior: Clip.antiAlias,
            child: Image.network(
              option.imageUrl,
              fit: BoxFit.cover,
              cacheWidth: 240,
              errorBuilder: (_, __, ___) => Icon(
                Icons.person_outline,
                color: TS.mutedOf(context),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
