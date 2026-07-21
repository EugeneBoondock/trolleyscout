import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../scout_avatar.dart';
import '../theme.dart';
import '../ux.dart';
import 'common.dart';

/// The shopper's profile tile. Rebuilds itself whenever the pick changes, so
/// every place it appears — app bar, drawer, dashboard, profile — updates the
/// instant a new icon is chosen, with no plumbing at the call sites.
///
/// Falls back to [initials] until a pick exists.
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
        final palette = avatar?.color;
        final background = palette?.background ?? TS.yellow;
        final foreground = palette?.foreground ?? TS.ink;
        return Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: background,
            border: Border.all(color: TS.lineOf(context), width: borderWidth),
            boxShadow: showShadow
                ? [
                    BoxShadow(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0x8C000000)
                          : const Color(0x291C1710),
                      offset: const Offset(2, 2),
                    ),
                  ]
                : null,
          ),
          // A short cross-fade rather than a hard swap, so choosing an icon in
          // the picker feels like the tile is changing, not blinking.
          child: AnimatedSwitcher(
            duration: MediaQuery.of(context).disableAnimations
                ? Duration.zero
                : const Duration(milliseconds: 180),
            child: avatar == null
                ? Text(
                    initials.isEmpty ? '?' : initials,
                    key: const ValueKey('initials'),
                    style: TextStyle(
                      color: foreground,
                      fontWeight: FontWeight.w900,
                      fontSize: size * 0.38,
                      height: 1,
                    ),
                  )
                : PhosphorIcon(
                    avatar.icon,
                    key: ValueKey(avatar.iconKey),
                    color: foreground,
                    size: size * 0.56,
                  ),
          ),
        );
      },
    );
  }
}

/// Opens the picker. Returns once the sheet closes; the store has already saved
/// and notified by then.
Future<void> showScoutAvatarPicker(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TS.bgOf(context),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
    builder: (context) => const _AvatarPickerSheet(),
  );
}

class _AvatarPickerSheet extends StatefulWidget {
  const _AvatarPickerSheet();

  @override
  State<_AvatarPickerSheet> createState() => _AvatarPickerSheetState();
}

class _AvatarPickerSheetState extends State<_AvatarPickerSheet> {
  late ScoutAvatar _draft = ScoutAvatarStore.instance.current ??
      ScoutAvatarCatalog.suggestionFor('');

  void _setIcon(String key) {
    if (_draft.iconKey == key) return;
    uxTap();
    setState(() => _draft = _draft.copyWith(iconKey: key));
  }

  void _setColor(String key) {
    if (_draft.colorKey == key) return;
    uxTap();
    setState(() => _draft = _draft.copyWith(colorKey: key));
  }

  Future<void> _save() async {
    uxSuccess();
    await ScoutAvatarStore.instance.save(_draft);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final palette = _draft.color;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.78,
      maxChildSize: 0.94,
      minChildSize: 0.5,
      builder: (context, scrollController) => Column(
        children: [
          _grabHandle(context),
          // Preview + colour row stay pinned: the point of the sheet is
          // watching the tile change as you tap, so it must never scroll away.
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            child: Row(
              children: [
                Container(
                  width: 72,
                  height: 72,
                  alignment: Alignment.center,
                  decoration: TS.card(context, color: palette.background),
                  child: PhosphorIcon(_draft.icon,
                      color: palette.foreground, size: 40),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('YOUR LOOK', style: TS.eyebrowOf(context)),
                      const SizedBox(height: 2),
                      Text(
                        'Pick a picture',
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.merge(TS.display),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        palette.label,
                        style: TextStyle(
                            color: TS.mutedOf(context), fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          _colorRow(context),
          const SizedBox(height: 4),
          Expanded(
            child: ListView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              children: [
                for (final group in ScoutAvatarCatalog.groups) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: 12, bottom: 8),
                    child: Text(group.label.toUpperCase(),
                        style: TS.eyebrowOf(context)),
                  ),
                  _iconGrid(context, group.iconKeys, palette),
                ],
              ],
            ),
          ),
          _saveBar(context),
        ],
      ),
    );
  }

  Widget _grabHandle(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Container(
          width: 44,
          height: 4,
          decoration: BoxDecoration(color: TS.lineSoftOf(context)),
        ),
      );

  Widget _colorRow(BuildContext context) => SizedBox(
        height: 52,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          itemCount: ScoutAvatarCatalog.colors.length,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (context, index) {
            final option = ScoutAvatarCatalog.colors[index];
            final selected = option.key == _draft.colorKey;
            return Semantics(
              selected: selected,
              label: option.label,
              button: true,
              child: PressableScale(
                child: GestureDetector(
                  onTap: () => _setColor(option.key),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 140),
                    curve: Curves.easeOut,
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: option.background,
                      border: Border.all(
                        color: selected
                            ? TS.redOf(context)
                            : TS.lineOf(context),
                        width: selected ? 4 : 2,
                      ),
                    ),
                    child: selected
                        ? PhosphorIcon(PhosphorIconsFill.check,
                            color: option.foreground, size: 18)
                        : null,
                  ),
                ),
              ),
            );
          },
        ),
      );

  Widget _iconGrid(
    BuildContext context,
    List<String> keys,
    ScoutAvatarColor palette,
  ) =>
      GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: keys.length,
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 76,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1,
        ),
        itemBuilder: (context, index) {
          final key = keys[index];
          final selected = key == _draft.iconKey;
          return Semantics(
            selected: selected,
            button: true,
            child: PressableScale(
              child: GestureDetector(
                onTap: () => _setIcon(key),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 140),
                  curve: Curves.easeOut,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: selected
                        ? palette.background
                        : TS.surfaceOf(context),
                    border: Border.all(
                      color:
                          selected ? TS.redOf(context) : TS.lineSoftOf(context),
                      width: selected ? 3 : 1.5,
                    ),
                  ),
                  child: PhosphorIcon(
                    ScoutAvatarCatalog.iconFor(key),
                    size: 28,
                    color: selected
                        ? palette.foreground
                        : TS.inkOf(context),
                  ),
                ),
              ),
            ),
          );
        },
      );

  Widget _saveBar(BuildContext context) => Container(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          12 + MediaQuery.paddingOf(context).bottom,
        ),
        decoration: BoxDecoration(
          color: TS.bgOf(context),
          border:
              Border(top: BorderSide(color: TS.lineOf(context), width: 3)),
        ),
        child: Row(
          children: [
            Expanded(
              child: FilledButton(
                onPressed: _save,
                child: const Text('Use this picture'),
              ),
            ),
          ],
        ),
      );
}
