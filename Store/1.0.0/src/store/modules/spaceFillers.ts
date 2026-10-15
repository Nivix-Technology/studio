import type { preferenceUpdateEventDetail } from '../../rpc/store-types';
import { preferences } from './settings';

function getEBD(id: string) { return document.getElementById(id); }
function wait(ms: number) { return new Promise((resolve) => { setTimeout(resolve, ms); }); }

function waitForAnimation(element: HTMLElement, animationsEnabled: boolean, fallbackMs: number = 350): Promise<void> {
    if (!animationsEnabled) return Promise.resolve();

    return new Promise((resolve) => {
        let timer: number;

        const onEnd = (e: AnimationEvent) => {
            if (e.target === element) {
                cleanup();
                resolve();
            }
        };

        const cleanup = () => {
            element.removeEventListener('animationend', onEnd);
            clearTimeout(timer);
        };

        element.addEventListener('animationend', onEnd);

        // Safety fallback timer so JS promises never hang
        timer = window.setTimeout(() => {
            cleanup();
            resolve();
        }, fallbackMs);
    });
}

export async function init() {
    fillSpaceContainer();
}

const shapeElementType: string = 'div';
const baseShapeClass: string = 'space-filler-shape';
const delay: number = 25; // Delay between shapes (ms)
let currentCallId = 0;
let lastCombinationIndex: number | null = null;

const floatAnimations = ['float', 'float-slow', 'float-fast', 'float-subtle'];

export async function fillSpaceContainer() {
    const callId = ++currentCallId;
    const container = getEBD('space-filler-container') as HTMLDivElement;
    if (preferences['useSpaceFillerBlur']) {
        container.classList.add('use-blur');
    } else {
        container.classList.remove('use-blur');
    }
    if (!container) return;
    if (!preferences['spaceFillersEnabled']) {
        container.classList.remove('is-fading-out');
        container.style.animationDuration = '';
        container.replaceChildren();
        return;
    }

    const combinations = [
        [ "circle1", "polygon4", "circle6", "triangle3", "triangle4", "polygon3", "polygon1", "circle2", "triangle5", "polygon6", "circle7" ],
        [ "polygon2", "triangle6", "circle5", "polygon1", "circle4", "triangle5", "circle1", "polygon5", "triangle3", "circle7", "triangle1" ],
        [ "circle3", "triangle1", "triangle7", "polygon6", "circle7", "polygon4", "circle1", "triangle4", "polygon2", "circle5" ],
        [ "circle6", "polygon4", "triangle3", "polygon1", "circle5", "triangle2", "polygon5", "circle2", "triangle7", "polygon3", "circle7" ],
        [ "circle1", "polygon2", "triangle6", "triangle4", "polygon5", "circle7", "polygon1", "circle3", "triangle5", "circle5", "polygon3" ],
        [ "polygon4", "triangle1", "circle3", "triangle2", "polygon3", "circle4", "polygon6", "triangle7", "circle1", "triangle6" ],
        [ "circle1", "triangle3", "polygon1", "triangle7", "polygon6", "circle2", "polygon2", "circle4", "triangle4", "polygon5", "circle5" ],
        [ "circle6", "polygon4", "triangle3", "polygon1", "triangle7", "polygon6", "circle7", "circle2", "triangle2", "polygon5", "circle4", "triangle5" ],
        [ "circle1", "triangle6", "polygon5", "triangle2", "circle7", "polygon3", "circle4", "triangle3", "polygon1", "circle3" ],
        [ "circle3", "polygon2", "triangle4", "polygon1", "triangle5", "circle2", "circle6", "polygon6", "triangle7", "circle4", "polygon5" ]
    ];
    
    const transitionAnimations = preferences['transitionAnimations'];
    const spaceFillerAnimations = preferences['spaceFillerAnimations'];

    if (container.children.length > 0) {
        if (transitionAnimations) {
            container.classList.remove('is-fading-out');
            void container.offsetWidth;
            container.classList.add('is-fading-out');
            await waitForAnimation(container, transitionAnimations);
        }
    }

    if (callId !== currentCallId) return;

    container.classList.remove('is-fading-out');
    container.style.animationDuration = '';
    container.replaceChildren();

    // Pick new combination strictly different from previous
    let randNum: number;
    do {
        randNum = Math.floor(Math.random() * combinations.length);
    } while (combinations.length > 1 && randNum === lastCombinationIndex);
    
    lastCombinationIndex = randNum;
    const combination = combinations[randNum];

    for (const shapeClass of combination) {
        if (callId !== currentCallId) return;

        const shapeElement = document.createElement(shapeElementType);
        const randomFloatClass = floatAnimations[Math.floor(Math.random() * floatAnimations.length)];
        shapeElement.classList.add(baseShapeClass, shapeClass);

        if (transitionAnimations) {
            if (spaceFillerAnimations) {
                shapeElement.addEventListener('animationend', (event: AnimationEvent) => {
                    if (event.animationName !== 'fadeInShape') return;
                    shapeElement.classList.remove('is-fading-in');
                    shapeElement.classList.add(randomFloatClass, 'is-floating');
                }, { once: true });
            }
            shapeElement.classList.add('is-fading-in');
        } else if (spaceFillerAnimations) {
            shapeElement.classList.add(randomFloatClass, 'is-floating');
        }

        container.appendChild(shapeElement);

        if (transitionAnimations) {
            await wait(delay);
        }
    }
}

window.addEventListener('tabChange', () => {
    if (preferences['updateSpaceFillersOnTabChange']) {
        fillSpaceContainer();
    }
});

window.addEventListener('preferencesUpdate', (event) => {
    const triggerPreferenceKeys = new Set([
        'spaceFillersEnabled',
        'spaceFillerAnimations',
        'updateSpaceFillersOnTabChange',
        'useSpaceFillerBlur'
    ]);
    const eventDetails = event as CustomEvent<preferenceUpdateEventDetail>;
    const { preference } = eventDetails.detail;

    if (triggerPreferenceKeys.has(preference)) {
        void fillSpaceContainer();
    }
});