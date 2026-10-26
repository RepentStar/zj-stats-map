#!/usr/bin/env python3
"""Merge task CSVs and validate population, industry and income (stdlib only)."""

import argparse
import csv
import json
import re
import sys
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATS_COLUMNS = ['adcode', 'year', 'indicator', 'value']
REGION_COLUMNS = ['adcode', 'name', 'short_name', 'level', 'parent', 'area_land', 'center_lng', 'center_lat']
INDICATOR_COLUMNS = ['indicator', 'label', 'unit', 'decimals', 'category', 'type', 'formula', 'source', 'direction', 'note']
SECTORS = ('primary', 'secondary', 'tertiary')
GDP_TOTAL = '(gdp_primary+gdp_secondary+gdp_tertiary)'
ACTIVE_INDICATORS = {
    'pop_resident', 'pop_density', 'income_urban_pc',
    *('gdp_' + sector for sector in SECTORS),
    *('share_' + sector for sector in SECTORS),
}


def read_csv(path, columns):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, strict=True)
        if reader.fieldnames != columns:
            raise ValueError(f'{path.name}: expected columns {",".join(columns)}')
        rows = []
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f'{path.name}:{reader.line_num}: column count mismatch')
            rows.append(row)
    if not rows:
        raise ValueError(f'{path.name}: no data rows')
    return rows


def number(value, label):
    try:
        result = Decimal(value)
    except (InvalidOperation, TypeError):
        raise ValueError(f'{label}: expected a numeric value, got {value!r}') from None
    if not result.is_finite():
        raise ValueError(f'{label}: value must be finite')
    return result


def read_stats(path, data_dir):
    """Normalize supplied city names using the registered full/short city names."""
    with path.open(encoding='utf-8-sig', newline='') as stream:
        columns = next(csv.reader(stream), None)
    if columns == STATS_COLUMNS:
        return read_csv(path, STATS_COLUMNS)
    rows = read_csv(path, ['城市', 'year', 'indicator', 'value'])
    city_codes = {
        name: row['adcode']
        for row in read_csv(data_dir / 'regions.csv', REGION_COLUMNS)
        if row['level'] == 'city'
        for name in (row['name'], row['short_name'])
    }
    normalized = []
    for row in rows:
        name = row['城市']
        if name not in city_codes:
            raise ValueError(f'{path.name}: unknown city name: {name!r}')
        normalized.append({'adcode': city_codes[name], **{key: row[key] for key in STATS_COLUMNS[1:]}})
    return normalized


def check_code(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{6}', value):
        raise ValueError(f'invalid string adcode: {value!r}')
    return value


def load_metadata(data_dir):
    regions = {}
    for row in read_csv(data_dir / 'regions.csv', REGION_COLUMNS):
        adcode = check_code(row['adcode'])
        if adcode in regions:
            raise ValueError(f'duplicate region: {adcode}')
        if row['level'] not in {'province', 'city'}:
            raise ValueError(f'{adcode}: only province and city levels are supported')
        for field, bound in [('center_lng', 180), ('center_lat', 90)]:
            if abs(number(row[field], f'{adcode}/{field}')) > bound:
                raise ValueError(f'{adcode}: invalid {field}')
        regions[adcode] = row
    cities = {code for code, row in regions.items() if row['level'] == 'city'}
    provinces = {code for code, row in regions.items() if row['level'] == 'province'}
    if provinces != {'330000'} or len(cities) != 11:
        raise ValueError('regions.csv must contain Zhejiang province and 11 cities')
    for code in cities:
        if regions[code]['parent'] != '330000' or number(regions[code]['area_land'], f'{code}/area_land') <= 0:
            raise ValueError(f'{code}: city must have a province parent and positive area_land')

    indicators = {}
    for row in read_csv(data_dir / 'indicators.csv', INDICATOR_COLUMNS):
        key = row['indicator']
        if key in indicators:
            raise ValueError(f'duplicate indicator: {key}')
        if not row['decimals'].isdigit() or not 0 <= int(row['decimals']) <= 20:
            raise ValueError(f'{key}: invalid decimals')
        if not row['label'] or not row['unit'] or row['type'] not in {'raw', 'derived'}:
            raise ValueError(f'{key}: invalid indicator metadata')
        indicators[key] = row
    if set(indicators) != ACTIVE_INDICATORS:
        raise ValueError('indicators.csv must register the nine population, industry and income indicators')
    if indicators['pop_resident']['type'] != 'raw' or indicators['pop_density']['type'] != 'derived' or indicators['pop_density']['formula'] != 'pop_resident*10000/area_land':
        raise ValueError('task-one indicator types or density formula do not match the design')
    for sector in SECTORS:
        if indicators['gdp_' + sector]['type'] != 'raw':
            raise ValueError(f'gdp_{sector}: expected raw indicator')
        share = indicators['share_' + sector]
        if share['type'] != 'derived' or share['formula'] != f'gdp_{sector}/{GDP_TOTAL}*100':
            raise ValueError(f'share_{sector}: invalid type or industry share formula')
    if indicators['income_urban_pc']['type'] != 'raw':
        raise ValueError('income_urban_pc: expected raw indicator')

    geojson = json.loads((data_dir / 'geo' / 'zhejiang_city.json').read_text(encoding='utf-8-sig'))
    if not isinstance(geojson, dict) or geojson.get('type') != 'FeatureCollection' or not isinstance(geojson.get('features'), list):
        raise ValueError('GeoJSON must be a FeatureCollection')
    geo_codes = set()
    for feature in geojson['features']:
        properties = feature.get('properties') or {}
        code = check_code(properties.get('adcode'))
        geometry = feature.get('geometry') or {}
        if code in geo_codes or code not in cities or feature.get('type') != 'Feature' or properties.get('level') != 'city':
            raise ValueError(f'invalid or duplicate city feature: {code}')
        if geometry.get('type') not in {'Polygon', 'MultiPolygon'} or not geometry.get('coordinates'):
            raise ValueError(f'{code}: expected nonempty Polygon or MultiPolygon')
        geo_codes.add(code)
    if geo_codes != cities:
        raise ValueError('GeoJSON city codes must exactly match regions.csv')
    return regions, cities, indicators, geo_codes


def validate(rows, data_dir):
    regions, cities, indicators, geo_codes = load_metadata(data_dir)
    index = {}
    years = set()
    for row in rows:
        code = check_code(row['adcode'])
        if code not in cities or code not in geo_codes:
            raise ValueError(f'{code}: statistics must reference a registered city and GeoJSON feature')
        if not re.fullmatch(r'[0-9]{4}', row['year']):
            raise ValueError(f'{code}: invalid year {row["year"]!r}')
        year = int(row['year'])
        indicator = row['indicator']
        if indicator not in indicators:
            raise ValueError(f'unregistered indicator: {indicator}')
        key = (code, year, indicator)
        if key in index:
            raise ValueError(f'duplicate primary key: {key}')
        index[key] = number(row['value'], str(key))
        if index[key] < 0:
            raise ValueError(f'{key}: value must be nonnegative')
        if indicator.startswith('share_') and index[key] > 100:
            raise ValueError(f'{key}: industry share must be between 0 and 100')
        years.add(year)
    if not index:
        raise ValueError('no statistics to validate')

    density_count = 0
    for (code, year, indicator), value in index.items():
        if indicator != 'pop_density':
            continue
        population = index.get((code, year, 'pop_resident'))
        if population is None:
            raise ValueError(f'{code}/{year}: population required to validate density')
        expected = population * Decimal(10000) / number(regions[code]['area_land'], f'{code}/area_land')
        if abs(value - expected) > Decimal('0.1'):
            raise ValueError(f'{code}/{year}: density {value} differs from formula {expected:.4f} by more than 0.1')
        density_count += 1

    shares_checked = 0
    share_groups = {(code, year) for code, year, indicator in index if indicator.startswith('share_')}
    for code, year in sorted(share_groups):
        required = [prefix + sector for prefix in ('gdp_', 'share_') for sector in SECTORS]
        if any((code, year, indicator) not in index for indicator in required):
            raise ValueError(f'{code}/{year}: all three GDP values and shares required to validate industry shares')
        total = sum(index[code, year, 'gdp_' + sector] for sector in SECTORS)
        if total <= 0:
            raise ValueError(f'{code}/{year}: industry GDP total must be positive')
        shares = [index[code, year, 'share_' + sector] for sector in SECTORS]
        for sector, share in zip(SECTORS, shares):
            expected = index[code, year, 'gdp_' + sector] / total * 100
            if abs(share - expected) > Decimal('0.01'):
                raise ValueError(f'{code}/{year}/share_{sector}: differs from GDP formula by more than 0.01 percentage points')
        if abs(sum(shares) - 100) > Decimal('0.01'):
            raise ValueError(f'{code}/{year}: industry shares must sum to 100 within 0.01 percentage points')
        shares_checked += 3

    expected_count = len(cities) * len(years) * len(indicators)
    counts = {indicator: sum(key[2] == indicator for key in index) for indicator in sorted(indicators)}
    return {
        'cities': len(cities), 'years': sorted(years), 'indicators': counts,
        'rows': len(index), 'expected': expected_count,
        'missing': expected_count - len(index), 'densities_checked': density_count,
        'shares_checked': shares_checked,
    }


def write_stats(rows, output):
    """Replace the output only after all inputs pass validation."""
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='', dir=output.parent, delete=False) as stream:
            temporary = Path(stream.name)
            writer = csv.DictWriter(stream, fieldnames=STATS_COLUMNS, lineterminator='\n')
            writer.writeheader()
            writer.writerows(sorted(rows, key=lambda row: (row['adcode'], int(row['year']), row['indicator'])))
        temporary.replace(output)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='validate stats.csv without writing')
    parser.add_argument('--data-dir', type=Path, default=PROJECT_ROOT / 'public' / 'data')
    parser.add_argument('--input', type=Path, nargs='+', help='raw input CSVs (default: raw/*.csv)')
    parser.add_argument('--output', type=Path, help='merged CSV (default: DATA_DIR/stats.csv)')
    args = parser.parse_args(argv)
    if args.check and (args.input or args.output):
        parser.error('--check cannot be combined with --input or --output')
    try:
        if args.check:
            sources = [args.data_dir / 'stats.csv']
        else:
            sources = args.input if args.input is not None else sorted((args.data_dir / 'raw').glob('*.csv'))
        if not sources:
            raise ValueError('no raw input CSV files found')
        rows = [row for path in sources for row in (read_csv(path, STATS_COLUMNS) if args.check else read_stats(path, args.data_dir))]
        report = validate(rows, args.data_dir)
        if not args.check:
            write_stats(rows, args.output or args.data_dir / 'stats.csv')
        print('Data validation passed')
        print(f'Coverage: {report["cities"]} cities x {len(report["years"])} years x {len(report["indicators"])} indicators = {report["rows"]}/{report["expected"]} rows ({report["rows"] / report["expected"]:.1%})')
        print(f'Years: {report["years"][0]}-{report["years"][-1]}; missing rows: {report["missing"]}; densities checked: {report["densities_checked"]}')
        print(f'Industry shares checked: {report["shares_checked"]}')
        for indicator, count in report['indicators'].items():
            print(f'  {indicator}: {count} rows')
        return 0
    except (OSError, ValueError, csv.Error, KeyError, TypeError, AttributeError) as error:
        print(f'Data validation failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
