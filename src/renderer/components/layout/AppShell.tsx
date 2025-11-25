import React from 'react';
import PropTypes from 'prop-types';

/**
 * AppShell - Consistent layout wrapper for application content
 * Matches the layout structure used in App.js
 *
 * @param {ReactNode} header - Header component (typically NavigationBar)
 * @param {ReactNode} subheader - Optional subheader component
 * @param {ReactNode} footer - Optional footer component
 * @param {ReactNode} children - Main content (phases)
 */
export default function AppShell({ header, subheader, footer, children }) {
  return (
    <div className="app-surface flex min-h-screen flex-col">
      {header}
      <main className="flex flex-1 flex-col pt-[var(--app-nav-height)] overflow-hidden">
        {subheader}
        <div className="flex-1 overflow-y-auto">
          <div className="animate-fade-in">{children}</div>
        </div>
      </main>
      {footer}
    </div>
  );
}

AppShell.propTypes = {
  header: PropTypes.node,
  subheader: PropTypes.node,
  footer: PropTypes.node,
  children: PropTypes.node,
};
