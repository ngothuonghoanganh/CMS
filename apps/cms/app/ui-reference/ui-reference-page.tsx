'use client';

import { useState } from 'react';

import {
  Accordion,
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  DropdownMenu,
  Panel,
  Popover,
  SearchField,
  Skeleton,
  Tabs,
  Toast,
  Tooltip,
} from '../ui/primitives';
import {
  CheckboxField,
  ColorField,
  DateField,
  DateTimeField,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
} from '../ui/fields';
import {
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  PaginationControls,
} from '../ui/surfaces';
type ReferenceTab = 'foundations' | 'controls' | 'surfaces';

export default function UiReferencePage() {
  const [tab, setTab] = useState<ReferenceTab>('foundations');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [color, setColor] = useState('');

  return (
    <>
      <PageHeader
        description="A development reference for CMS Admin Design System primitives and states."
        eyebrow="CMS UI Kit"
        title="Admin UI Reference"
      />
      <Tabs
        ariaLabel="Admin UI reference sections"
        onChange={setTab}
        options={[
          { label: 'Foundations', value: 'foundations' },
          { label: 'Controls', value: 'controls' },
          { label: 'Surfaces', value: 'surfaces' },
        ]}
        value={tab}
      />

      {tab === 'foundations' ? (
        <div className="ui-reference-grid">
          <Panel className="ui-reference-card">
            <span className="eyebrow">Color roles</span>
            <div className="ui-reference-swatches">
              {[
                ['Canvas', 'var(--cms-bg-canvas)'],
                ['Surface', 'var(--cms-bg-surface)'],
                ['Raised', 'var(--cms-bg-surface-raised)'],
                ['Selected', 'var(--cms-bg-surface-selected)'],
                ['Accent', 'var(--cms-accent-surface)'],
                ['Danger', 'var(--cms-danger-surface)'],
              ].map(([label, colorValue]) => (
                <div className="ui-reference-swatch" key={label}>
                  <span style={{ background: colorValue }} />
                  <strong>{label}</strong>
                  <small>{colorValue}</small>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="ui-reference-card ui-reference-type-card">
            <span className="eyebrow">Typography</span>
            <h2>Page title</h2>
            <h3>Section title</h3>
            <p>Body copy stays compact, readable, and subordinate to the task.</p>
            <span className="muted small">Caption · metadata · helper text</span>
            <code>monospace / code / identifiers</code>
          </Panel>
        </div>
      ) : null}

      {tab === 'controls' ? (
        <div className="ui-reference-grid ui-reference-controls">
          <Panel className="ui-reference-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Buttons</span>
                <h2>Actions and hierarchy</h2>
              </div>
            </div>
            <div className="form-actions">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </Panel>
          <Panel className="ui-reference-card">
            <span className="eyebrow">Fields</span>
            <div className="ui-reference-form-grid">
              <TextField label="Name" placeholder="Content model" />
              <SelectField label="Status" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </SelectField>
              <TextAreaField label="Description" rows={3} />
              <ColorField label="Accent" onValueChange={setColor} value={color} />
              <DateField label="Publish date" onValueChange={() => undefined} value="" />
              <DateTimeField
                label="Updated at"
                onValueChange={() => undefined}
                value=""
              />
              <CheckboxField
                checked={checked}
                label="Required field"
                onChange={(event) => setChecked(event.target.checked)}
              />
              <SwitchField
                checked={enabled}
                label="Enabled"
                onChange={(event) => setEnabled(event.target.checked)}
              />
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === 'surfaces' ? (
        <div className="ui-reference-stack">
          <Panel className="ui-reference-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Feedback</span>
                <h2>Status and system states</h2>
              </div>
              <SearchField label="Search components" placeholder="Search…" />
            </div>
            <div className="ui-reference-state-row">
              <Badge>Neutral</Badge>
              <Badge tone="success">Success</Badge>
              <Badge tone="warning">Warning</Badge>
              <Badge tone="danger">Danger</Badge>
              <Badge tone="info">Info</Badge>
            </div>
            <Alert title="Saved" tone="success">
              Changes are synchronized with the workspace.
            </Alert>
            <LoadingState label="Loading resource…" />
            <EmptyState description="There are no records to show." title="Empty state" />
            <ErrorState
              message="Try again or contact an administrator."
              title="Error state"
            />
            <div className="ui-reference-component-row">
              <Tooltip label="Helpful context">Hover or focus me</Tooltip>
              <Popover label="Open popover">Popover content</Popover>
              <DropdownMenu
                items={[{ label: 'Edit' }, { disabled: true, label: 'Archive' }]}
                label="Actions"
              />
              <Skeleton width="8rem" />
            </div>
            <Toast title="Toast" tone="info">
              Non-blocking feedback stays concise.
            </Toast>
            <Breadcrumbs
              items={[
                { href: '#reference', label: 'Workspace' },
                { href: '#reference', label: 'Collections' },
                { label: 'Products' },
              ]}
            />
            <Accordion
              items={[
                {
                  content: 'Disclosure content stays task-focused.',
                  defaultOpen: true,
                  id: 'one',
                  title: 'Accordion item',
                },
              ]}
            />
          </Panel>
          <Panel className="ui-reference-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Data table</span>
                <h2>Bounded table and pagination</h2>
              </div>
              <Button onClick={() => setDrawerOpen(true)} size="sm" variant="secondary">
                Open drawer
              </Button>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th scope="col">Resource</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Products</td>
                  <td>
                    <Badge tone="success">Published</Badge>
                  </td>
                  <td className="muted">Just now</td>
                </tr>
                <tr>
                  <td>Landing pages</td>
                  <td>
                    <Badge tone="warning">Draft</Badge>
                  </td>
                  <td className="muted">Yesterday</td>
                </tr>
              </tbody>
            </DataTable>
            <PaginationControls
              onNext={() => undefined}
              onPrevious={() => undefined}
              pagination={{ hasNextPage: true, limit: 20, offset: 0, total: 42 }}
            />
            <Button onClick={() => setModalOpen(true)} size="sm" variant="ghost">
              Open dialog
            </Button>
          </Panel>
        </div>
      ) : null}

      <Drawer
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title="Reference drawer"
      >
        <p className="muted">Short create/edit tasks belong in a drawer.</p>
      </Drawer>
      <Modal
        footer={
          <Button onClick={() => setModalOpen(false)} variant="primary">
            Done
          </Button>
        }
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        size="sm"
        title="Reference dialog"
      >
        <p className="muted">Destructive or focused decisions belong in a dialog.</p>
      </Modal>
    </>
  );
}
