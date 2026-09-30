const loadedStylesheets = new Map();

let stylesheetCounter:number = 0;

export function loadCSS(href: string, parent: HTMLElement = document.head) {
    console.log(`Loading Stylesheet - Source: ${href}, Parent: ${parent}`);
    for (const [id, link] of loadedStylesheets.entries()) {
        if (link.getAttribute('href') === href) {
            return id;
        }
    }

    const link = document.createElement('link');
    link.rel = "stylesheet";
    link.href = href;

    const id = `stylesheet-${++stylesheetCounter}`;
    link.id = id;

    if (parent) {
        parent.appendChild(link);
    } else {
        console.error("Failed to append stylesheet. Parent doesn't exist.");
        return null;
    }

    loadedStylesheets.set(id, link);
    return id;
}

export function unloadCSS(id: string) {
    console.log(`Unloading Stylesheet with ID: ${id}`);
    if (loadedStylesheets.has(id)) {
        const link = loadedStylesheets.get(id);
        link.remove();
        loadedStylesheets.delete(id);
    } else {
        console.warn(`Stylesheet with ID "${id}" not found.`);
    }
}

export async function populateSVGs(rpcFetchSvg?: (path: string) => Promise<string>) {
    // Select both custom element tag forms (<svgPlaceholder> and <svgplaceholder>)
    const placeholders = document.querySelectorAll('svgPlaceholder, svgplaceholder');

    for (const placeholder of Array.from(placeholders)) {
        const path = placeholder.textContent?.trim();
        
        if (!path) {
            console.warn("Found an <svgPlaceholder> without a valid file path inside.");
            continue;
        }

        try {
            let svgText = "";

            // Use RPC handler if provided, otherwise default to standard fetch()
            if (rpcFetchSvg) {
                svgText = await rpcFetchSvg(path);
            } else {
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`HTTP status ${response.status}`);
                }
                svgText = await response.text();
            }

            // Parse SVG string into DOM nodes
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgElement = svgDoc.querySelector('svg');

            if (svgElement) {
                // Preserve ID or class names from the placeholder if set
                if (placeholder.id) svgElement.id = placeholder.id;
                if (placeholder.className) svgElement.setAttribute('class', placeholder.className);

                // Replace <svgPlaceholder> with the actual <svg>
                placeholder.replaceWith(svgElement);
            } else {
                console.error(`No valid <svg> tag found in file at path: "${path}"`);
            }
        } catch (error) {
            console.error(`Failed to load SVG from path "${path}":`, error);
        }
    }
}