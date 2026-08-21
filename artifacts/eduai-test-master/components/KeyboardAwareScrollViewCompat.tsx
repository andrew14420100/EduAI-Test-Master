import { ScrollView, ScrollViewProps } from 'react-native';

type Props = ScrollViewProps & { bottomOffset?: number };

export function KeyboardAwareScrollViewCompat({
  children,
  bottomOffset: _bottomOffset,
  keyboardShouldPersistTaps = 'handled',
  ...props
}: Props) {
  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
