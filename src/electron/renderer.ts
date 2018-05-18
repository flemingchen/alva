import { webFrame } from 'electron';
import * as Mobx from 'mobx';
import * as React from 'react';
import * as ReactDom from 'react-dom';
import * as Types from '../model/types';
import * as uuid from 'uuid';

import { App } from '../container/app';
import * as Sender from '../message/client';
import { ElementAnchors } from '../components';
import { createMenu } from './create-menu';
import {
	contentFromTarget,
	elementFromTarget,
	handleDragDrop
} from '../container/element-list/element-list';
import { ServerMessageType } from '../message';
import { ElementProperty, Project, SyntheticPatternType } from '../model';
import { ViewStore } from '../store';

// prevent app zooming
webFrame.setVisualZoomLevelLimits(1, 1);
webFrame.setLayoutZoomLevelLimits(0, 0);

const store = ViewStore.getInstance();

Sender.send({
	id: uuid.v4(),
	type: ServerMessageType.AppLoaded,
	payload: undefined
});

Sender.receive(message => {
	// Initilazing messages
	switch (message.type) {
		case ServerMessageType.StartApp: {
			store.setAppState(Types.AppState.Started);
			store.setServerPort(Number(message.payload));
			break;
		}
		case ServerMessageType.OpenFileResponse: {
			const newProject = Project.from(message.payload.contents);
			newProject.setPath(message.payload.path);
			store.setProject(newProject);

			const view =
				newProject.getPages().length === 0 ? Types.AlvaView.Pages : Types.AlvaView.PageDetail;

			store.setActiveView(view);

			const patternLibrary = newProject.getPatternLibrary();

			if (patternLibrary.getState() !== Types.PatternLibraryState.Pristine) {
				Sender.send({
					id: uuid.v4(),
					payload: newProject.toJSON(),
					type: ServerMessageType.CheckLibraryRequest
				});
			}

			break;
		}
		case ServerMessageType.CreateNewFileResponse: {
			const newProject = Project.from(message.payload.contents);
			store.setProject(newProject);
			store.setActiveView(Types.AlvaView.PageDetail);
		}
	}
});

Sender.receive(message => {
	const project = store.getProject();

	if (!project) {
		return;
	}

	switch (message.type) {
		case ServerMessageType.CreateNewPage: {
			const page = store.addNewPage();

			if (!page) {
				return;
			}

			store.setActivePage(page);

			if (store.getActiveView() === Types.AlvaView.Pages) {
				page.setNameState(Types.EditState.Editing);
			}
			break;
		}
		case ServerMessageType.ConnectPatternLibraryResponse: {
			const library = project.getPatternLibrary();
			library.import(message.payload);

			Sender.send({
				id: uuid.v4(),
				payload: {
					id: library.getId(),
					path: message.payload.path
				},
				type: ServerMessageType.ConnectedPatternLibraryNotification
			});

			break;
		}
		case ServerMessageType.CheckLibraryResponse: {
			const library = project.getPatternLibrary();

			message.payload.forEach(check => {
				if (check.id !== library.getId()) {
					return;
				}

				const state = check.connected
					? Types.PatternLibraryState.Connected
					: Types.PatternLibraryState.Disconnected;

				library.setState(state);
			});
			break;
		}
		case ServerMessageType.SelectElement: {
			const element = store.getElementById(message.payload.id);
			if (element) {
				store.setSelectedElement(element);
			}
			break;
		}
		case ServerMessageType.UnselectElement: {
			store.unsetSelectedElement();
		}
	}
});

// tslint:disable-next-line:cyclomatic-complexity
Sender.receive(message => {
	// Do not perform custom operations when an input is selected
	if (document.activeElement.tagName.toLowerCase() === 'input') {
		return;
	}

	switch (message.type) {
		case ServerMessageType.Undo: {
			store.undo();
			break;
		}
		case ServerMessageType.Redo: {
			store.redo();
			break;
		}
		case ServerMessageType.Cut: {
			if (store.getActiveView() === Types.AlvaView.Pages) {
				// TODO: implement this
				// store.cutSelectedPage();
			}
			if (store.getActiveView() === Types.AlvaView.PageDetail) {
				store.cutSelectedElement();
			}
			break;
		}
		case ServerMessageType.CutElement: {
			store.cutElementById(message.payload);
			break;
		}
		case ServerMessageType.Delete: {
			if (store.getActiveView() === Types.AlvaView.Pages) {
				store.removeSelectedPage();
			}
			if (store.getActiveView() === Types.AlvaView.PageDetail) {
				store.removeSelectedElement();
			}
			break;
		}
		case ServerMessageType.DeleteElement: {
			store.removeElementById(message.payload);
			break;
		}
		case ServerMessageType.Copy: {
			if (store.getActiveView() === Types.AlvaView.Pages) {
				// TODO: implement this
				// store.copySelectedPage();
			}
			if (store.getActiveView() === Types.AlvaView.PageDetail) {
				store.copySelectedElement();
			}
			break;
		}
		case ServerMessageType.CopyElement: {
			store.copyElementById(message.payload);
			break;
		}
		case ServerMessageType.Paste: {
			if (store.getActiveView() === Types.AlvaView.Pages) {
				// TODO: implement this
				// store.pasteAfterSelectedPage();
			}
			if (store.getActiveView() === Types.AlvaView.PageDetail) {
				store.pasteAfterSelectedElement();
			}
			break;
		}
		case ServerMessageType.PasteElementBelow: {
			store.pasteAfterElementById(message.payload);
			break;
		}
		case ServerMessageType.PasteElementInside: {
			store.pasteInsideElementById(message.payload);
			break;
		}
		case ServerMessageType.Duplicate: {
			if (store.getActiveView() === Types.AlvaView.PageDetail) {
				store.duplicateSelectedElement();
			}
			break;
		}
		case ServerMessageType.DuplicateElement: {
			if (store.getActiveView() === Types.AlvaView.PageDetail) {
				store.duplicateElementById(message.payload);
			}
			break;
		}
		case ServerMessageType.CreateNewPlaceholder: {
			const patternLibrary = store.getPatternLibrary();
			const targetElement = store.getElementById(message.payload.targetElementId);
			const targetContent = store.getContentById(message.payload.targetContentId);

			if (!patternLibrary || !targetContent) {
				return;
			}

			const pattern = patternLibrary.getPatternByType(SyntheticPatternType.SyntheticPlaceholder);
			const property = pattern.getPropertyByName('src');

			if (!property) {
				return;
			}

			const element = store.createElement({
				pattern,
				properties: [
					new ElementProperty(
						{
							id: uuid.v4(),
							patternPropertyId: property.getId(),
							setDefault: false,
							value: message.payload.data
						},
						{ patternLibrary }
					)
				]
			});

			store.addElement(element);

			if (!targetElement) {
				return;
			}

			handleDragDrop(message.payload.isSiblingDrop, targetContent, targetElement, element);
		}
	}
});

Mobx.autorunAsync(() => {
	const patternLibrary = store.getPatternLibrary();

	if (patternLibrary) {
		Sender.send({
			id: uuid.v4(),
			payload: patternLibrary.toJSON(),
			type: ServerMessageType.PatternLibraryChange
		});
	}
});

Mobx.autorunAsync(() => {
	const project = store.getProject();
	const currentPage = store.getCurrentPage();

	if (project && currentPage) {
		const payload = {
			pageId: currentPage.getId(),
			pages: project.getPages().map(page => page.toJSON()),
			elementContents: project
				.getElementContents()
				.map(elementContent => elementContent.toJSON()),
			elements: project.getElements().map(element => element.toJSON())
		};

		// tslint:disable-next-line:no-any
		(window as any).requestIdleCallback(() => {
			Sender.send({
				id: uuid.v4(),
				payload,
				type: ServerMessageType.PageChange
			});
		});
	}
});

Mobx.autorunAsync(() => {
	const selectedElement = store.getSelectedElement();
	Sender.send({
		id: uuid.v4(),
		payload: selectedElement ? selectedElement.getId() : undefined,
		type: ServerMessageType.ElementChange
	});
});

Mobx.autorunAsync(() => {
	const project = store.getProject();
	const patternLibrary = store.getPatternLibrary();
	const page = store.getCurrentPage();

	createMenu({
		page,
		patternLibrary,
		project,
		store
	});
});

ReactDom.render(React.createElement(App), document.getElementById('app'));

// Disable drag and drop from outside the application
document.addEventListener(
	'dragenter',
	event => {
		event.preventDefault();
	},
	false
);
document.addEventListener(
	'dragover',
	event => {
		event.preventDefault();
		if (!event.target) {
			event.dataTransfer.dropEffect = 'none';
		}
	},
	false
);

document.addEventListener(
	'drop',
	event => {
		event.preventDefault();
		if (event.target) {
			const sourcePath = event.dataTransfer.files[0].path;

			if (
				!sourcePath ||
				!event.target ||
				(!sourcePath.endsWith('.png') &&
					!sourcePath.endsWith('.jpg') &&
					!sourcePath.endsWith('.svg') &&
					!sourcePath.endsWith('.gif'))
			) {
				return;
			}

			const target = event.target as HTMLElement;
			const isSiblingDrop = target.getAttribute(ElementAnchors.placeholder) === 'true';
			const targetContent = contentFromTarget(target, { sibling: isSiblingDrop });
			const targetElement = elementFromTarget(target, { sibling: false });

			if (!targetContent || !targetElement) {
				return;
			}

			Sender.send({
				id: uuid.v4(),
				payload: {
					isSiblingDrop,
					path: sourcePath,
					targetContentId: targetContent.getId(),
					targetElementId: targetElement.getId()
				},
				type: ServerMessageType.DroppedFile
			});
		}
	},
	false
);
