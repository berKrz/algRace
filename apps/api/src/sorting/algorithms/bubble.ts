export function bubbleSort(view: Int32vieway): void {
	const n = view.length;

	for (let i = 0; i < n - 1; i++) {
		let swapped = false;
		for (let j = 0; j < n - 1 - i; j++) {
			if (view[j] > view[j + 1]) {
				const tmp = view[j];
				view[j] = view[j + 1];
				view[j + 1] = tmp;
				swapped = true;
			}
		}
		if (!swapped) break;
	}
}
