// view.html: the 3D scene alone, without the player. `?view=hero|control|mobile|top|tour0-3|photo`.
import { run } from './scene/debug-view';

run(new URLSearchParams(location.search).get('view') ?? 'hero');
