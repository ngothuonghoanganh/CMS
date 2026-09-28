'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider } from 'antd';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createAdminAntdTheme } from './admin-antd-theme';

type AdminThemePreference = 'dark' | 'light' | 'system';

export function AdminAntdProvider({
  children,
  preference,
}: {
  children: ReactNode;
  preference: AdminThemePreference;
}) {
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const mode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  const antdTheme = useMemo(() => createAdminAntdTheme(mode), [mode]);
  const getPopupContainer = useCallback((triggerNode?: HTMLElement) => {
    const adminRoot = triggerNode?.closest<HTMLElement>('[data-cms-admin-root]');
    return (
      adminRoot ??
      document.querySelector<HTMLElement>('[data-cms-admin-root]') ??
      document.body
    );
  }, []);

  return (
    <AntdRegistry>
      <ConfigProvider
        getPopupContainer={getPopupContainer}
        iconPrefixCls="cms-antdicon"
        prefixCls="cms-antd"
        theme={antdTheme}
      >
        <AntdApp>
          <div className="cms-admin-root" data-cms-admin-root>
            {children}
          </div>
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
