import { useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';

/**
 * Returns true when running on the web with a viewport wide enough for a
 * desktop-style layout (sidebar + wider content). Mobile web and native
 * platforms always return false, keeping the mobile experience intact.
 */
export function useIsDesktop(minWidth = 900): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () => Platform.OS === 'web' && Dimensions.get('window').width >= minWidth,
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const compute = () => Platform.OS === 'web' && Dimensions.get('window').width >= minWidth;
    setIsDesktop(compute());
    const sub = Dimensions.addEventListener('change', () => setIsDesktop(compute()));
    return () => sub.remove();
  }, [minWidth]);

  return isDesktop;
}
