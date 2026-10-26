import contextlib
import copy
import io
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from scripts import merge_stats as pipeline

DATA_DIR = Path(__file__).resolve().parents[1] / 'public' / 'data'


class DataPipelineTests(unittest.TestCase):
    def setUp(self):
        self.rows = pipeline.read_csv(DATA_DIR / 'stats.csv', pipeline.STATS_COLUMNS)
        self.density = next(row for row in self.rows if (row['adcode'], row['year'], row['indicator']) == ('330100', '2016', 'pop_density'))

    def test_current_data_has_full_coverage(self):
        report = pipeline.validate(self.rows, DATA_DIR)
        self.assertEqual(report['rows'], 990)
        self.assertEqual(report['expected'], 990)
        self.assertEqual(report['missing'], 0)
        self.assertEqual(report['densities_checked'], 110)
        self.assertEqual(report['shares_checked'], 330)
        self.assertEqual(set(report['indicators'].values()), {110})
        self.assertEqual(report['years'], list(range(2016, 2026)))

    def test_invalid_csv_schema_or_column_count_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'stats.csv'
            for text in ['adcode,year,value\n330100,2016,1\n', 'adcode,year,indicator,value\n330100,2016,pop_resident\n']:
                path.write_text(text, encoding='utf-8')
                with self.assertRaises(ValueError):
                    pipeline.read_csv(path, pipeline.STATS_COLUMNS)

    def test_bad_codes_unknown_indicators_and_years_are_rejected(self):
        for field, value in [('adcode', '33010'), ('adcode', '330999'), ('adcode', '330000'), ('indicator', 'gdp'), ('year', '2016.0')]:
            with self.subTest(field=field, value=value):
                rows = copy.deepcopy(self.rows)
                rows[0][field] = value
                with self.assertRaises(ValueError):
                    pipeline.validate(rows, DATA_DIR)

    def test_duplicate_primary_key_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duplicate primary key'):
            pipeline.validate(self.rows + [self.rows[0]], DATA_DIR)

    def test_blank_placeholders_and_nonfinite_values_are_rejected(self):
        for value in ['', '-', 'null', 'NaN', 'Infinity']:
            with self.subTest(value=value):
                rows = copy.deepcopy(self.rows)
                rows[0]['value'] = value
                with self.assertRaises(ValueError):
                    pipeline.validate(rows, DATA_DIR)

    def test_density_tolerance_accepts_boundary_and_rejects_excess(self):
        rows = copy.deepcopy(self.rows)
        density = rows[self.rows.index(self.density)]
        expected = Decimal('918.8') * 10000 / Decimal('16873.5')
        density['value'] = str(expected + Decimal('0.1'))
        pipeline.validate(rows, DATA_DIR)
        density['value'] = str(expected + Decimal('0.1001'))
        with self.assertRaisesRegex(ValueError, 'more than 0.1'):
            pipeline.validate(rows, DATA_DIR)

    def test_missing_density_is_reported_without_filling_zero(self):
        rows = [row for row in self.rows if row is not self.density]
        report = pipeline.validate(rows, DATA_DIR)
        self.assertEqual(report['missing'], 1)
        self.assertEqual(report['rows'], 989)
        with self.assertRaisesRegex(ValueError, 'population required'):
            pipeline.validate([row for row in self.rows if not (row['adcode'] == '330100' and row['year'] == '2016' and row['indicator'] == 'pop_resident')], DATA_DIR)

    def test_industry_formulas_sum_dependencies_and_ranges_are_checked(self):
        def changed(values):
            rows = copy.deepcopy(self.rows)
            for row in rows:
                if row['adcode'] == '330100' and row['year'] == '2016' and row['indicator'] in values:
                    row['value'] = values[row['indicator']]
            return rows

        with self.assertRaisesRegex(ValueError, 'GDP formula'):
            pipeline.validate(changed({'share_primary': '3.76'}), DATA_DIR)
        # Each rounded value is within formula tolerance, but their sum is invalid.
        gdp = {row['indicator']: Decimal(row['value']) for row in self.rows if row['adcode'] == '330100' and row['year'] == '2016' and row['indicator'].startswith('gdp_')}
        inflated = {f'share_{sector}': str(gdp[f'gdp_{sector}'] / sum(gdp.values()) * 100 + Decimal('0.006')) for sector in pipeline.SECTORS}
        with self.assertRaisesRegex(ValueError, 'sum to 100'):
            pipeline.validate(changed(inflated), DATA_DIR)
        with self.assertRaisesRegex(ValueError, 'all three GDP'):
            pipeline.validate([row for row in self.rows if not (row['adcode'] == '330100' and row['year'] == '2016' and row['indicator'] == 'gdp_primary')], DATA_DIR)
        with self.assertRaisesRegex(ValueError, 'total must be positive'):
            pipeline.validate(changed({f'gdp_{sector}': '0' for sector in pipeline.SECTORS}), DATA_DIR)
        for indicator, value in [('income_urban_pc', '-1'), ('gdp_primary', '-1'), ('share_primary', '100.01')]:
            with self.subTest(indicator=indicator), self.assertRaises(ValueError):
                pipeline.validate(changed({indicator: value}), DATA_DIR)

    def test_city_name_input_is_mapped_and_unknown_cities_fail(self):
        rows = pipeline.read_stats(DATA_DIR / 'raw/stats_task4.csv', DATA_DIR)
        self.assertEqual(len(rows), 110)
        self.assertEqual(rows[0], {'adcode': '330100', 'year': '2016', 'indicator': 'income_urban_pc', 'value': '52185'})
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'income.csv'
            for name in ['杭州', '杭州市', '未知市']:
                path.write_text(f'城市,year,indicator,value\n{name},2016,income_urban_pc,52185\n', encoding='utf-8-sig')
                if name == '未知市':
                    with self.assertRaisesRegex(ValueError, 'unknown city name'):
                        pipeline.read_stats(path, DATA_DIR)
                else:
                    self.assertEqual(pipeline.read_stats(path, DATA_DIR)[0]['adcode'], '330100')

    def test_raw_sources_reproduce_the_merged_data(self):
        rows = [row for path in sorted((DATA_DIR / 'raw').glob('*.csv')) for row in pipeline.read_stats(path, DATA_DIR)]
        sort_key = lambda row: (row['adcode'], int(row['year']), row['indicator'])
        self.assertEqual(sorted(rows, key=sort_key), self.rows)

    def test_missing_boundary_and_numeric_codes_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            (data_dir / 'geo').mkdir()
            for filename in ['regions.csv', 'indicators.csv']:
                (data_dir / filename).write_bytes((DATA_DIR / filename).read_bytes())
            original = json.loads((DATA_DIR / 'geo/zhejiang_city.json').read_text(encoding='utf-8'))
            for mode in ['missing', 'numeric']:
                geojson = copy.deepcopy(original)
                if mode == 'missing':
                    geojson['features'].pop()
                else:
                    geojson['features'][0]['properties']['adcode'] = 330100
                (data_dir / 'geo/zhejiang_city.json').write_text(json.dumps(geojson), encoding='utf-8')
                with self.assertRaises(ValueError):
                    pipeline.validate(self.rows, data_dir)

    def test_merge_multiple_inputs_and_failure_preserves_previous_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            temporary = Path(temporary)
            sources = [temporary / 'first.csv', temporary / 'second.csv']
            pipeline.write_stats(self.rows[:100], sources[0])
            pipeline.write_stats(self.rows[100:], sources[1])
            output = temporary / 'merged.csv'
            args = ['--data-dir', str(DATA_DIR), '--input', *map(str, sources), '--output', str(output)]
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(pipeline.main(args), 0)
            original = output.read_bytes()
            self.assertEqual(pipeline.validate(pipeline.read_csv(output, pipeline.STATS_COLUMNS), DATA_DIR)['rows'], 990)
            pipeline.write_stats([self.rows[0], self.rows[0]], sources[1])
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(pipeline.main(args), 1)
            self.assertEqual(output.read_bytes(), original)

    def test_check_mode_does_not_write_statistics(self):
        original = (DATA_DIR / 'stats.csv').read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(pipeline.main(['--check', '--data-dir', str(DATA_DIR)]), 0)
        self.assertEqual((DATA_DIR / 'stats.csv').read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
